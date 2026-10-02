import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen } from 'storybook/test'
import { SessionAgentMeter } from '@/entities/agent-meter'
import { LoomHorseAccessLine } from './loom-horse-access.presentational'
import { loomHorseAccessLine } from './loom-horse-access.pure'
import { LoomHorseCard } from './loom-horse.presentational'
import { loomHorses, type LoomHorseSession } from './loom-horses.pure'
import { loomSheets } from './loom-sheets.pure'
import { boundCrewWith, ledgerEntry, residentSeat } from './wave-rows.fixture'

/** The board's clock, fixed (MAR-3619). */
const NOW = Date.parse('2026-09-21T08:00:00.000Z')

const crew = boundCrewWith('crew-1', 'convergence development', [
  residentSeat('opus-mac', { hostPolicy: 'local' }),
])

const held = ledgerEntry({
  issueIdentifier: 'MAR-3195',
  issueTitle: 'Loom: read an issue in place',
  state: 'working',
  seat: 'opus-mac',
  sessionId: 'session-opus-mac',
  trackerStatus: 'In Progress',
  lap: 2,
})

/**
 * One seat's card, built by the model the app builds it with: never a
 * hand-written horse, so the card cannot agree with itself while the app
 * disagrees.
 */
const horseFor = (
  session: LoomHorseSession | null,
  rows: Parameters<typeof loomSheets>[0] = [held],
) =>
  loomHorses({
    crews: [crew],
    sessionsById: new Map(session ? [['session-opus-mac', session]] : []),
    sheets: loomSheets(rows, NOW),
    hostLabelOf: (id) => (id === 'local' ? 'This Mac' : id),
  })[0]!

const meta = {
  title: 'Features/Waves/LoomHorse',
  component: LoomHorseCard,
  args: {
    horse: horseFor({ status: 'running' }),
    meterSlot: (
      <SessionAgentMeter
        row={{
          sessionId: 'session-opus-mac',
          account: 'Personal',
          usage: { cpu: 12, memoryMb: 412 },
        }}
      />
    ),
    accessSlot: (
      <LoomHorseAccessLine
        line={
          loomHorseAccessLine({ remote: false, accountId: null, rows: [] })!
        }
      />
    ),
    onOpenSeat: fn(),
    onShowNext: fn(),
    onShowDetail: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-80 rounded-xl bg-surface py-2">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    const realNow = Date.now
    Date.now = () => NOW
    return () => {
      Date.now = realNow
    }
  },
} satisfies Meta<typeof LoomHorseCard>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A working seat: the card opens the conversation; the ticket line and
 * Details read the issue in place. Two doors, siblings, never nested.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('button', { name: /^opus-mac Working/ })
    await expect(card).toHaveAccessibleName(
      /MAR-3195 · Loom: read an issue in place/,
    )
    await expect(card).toHaveAccessibleName(/Open →$/)
    await expect(canvas.getByText('CPU / memory')).toBeVisible()
    await expect(
      canvas.getByText('Figma, Linear: default account, not checked'),
    ).toBeVisible()
    await userEvent.click(card)
    await expect(args.onOpenSeat).toHaveBeenCalledWith('session-opus-mac')
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'MAR-3195 · Loom: read an issue in place',
      }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Details' }))
    await expect(args.onShowDetail).toHaveBeenCalledTimes(2)
    // Neither of the issue's doors travelled on to the card.
    await expect(args.onOpenSeat).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * The meter's tooltip on an openable card (MC N1): the card's door covers
 * the meter, so the pointer over it lands on the door, and the meter still
 * says what it measures.
 */
export const MeterTooltip: Story = {
  name: 'Meter tooltip',
  play: async ({ canvas }) => {
    const door = canvas.getByRole('button', { name: /^opus-mac Working/ })
    const meter = canvas.getByTestId('session-agent-meter')
    const box = meter.getBoundingClientRect()
    const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    await expect(document.elementFromPoint(at.x, at.y)).toBe(door)
    door.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse',
        clientX: at.x,
        clientY: at.y,
      }),
    )
    const tooltip = await screen.findByRole('tooltip', {}, { timeout: 2000 })
    await expect(tooltip).toHaveTextContent(/^Agent CPU and memory/)
  },
}

/** An idle seat holds nothing; it offers the work queued for it. */
export const Idle: Story = {
  args: { horse: horseFor({ status: 'completed' }, []) },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText('Idle')).toBeVisible()
    await expect(canvas.getByText('No active ticket')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'View next work →' }),
    )
    await expect(args.onShowNext).toHaveBeenCalledOnce()
  },
}

/** A compacting seat is busy: it says so and is not offered next work. */
export const Busy: Story = {
  args: { horse: horseFor({ status: 'completed', activity: 'compacting' }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Compacting context…')).toBeVisible()
    await expect(
      canvas.queryByRole('button', { name: 'View next work →' }),
    ).toBeNull()
  },
}

/** A failed run: the card's door says it leads to the run's error. */
export const Failed: Story = {
  args: { horse: horseFor({ status: 'failed' }) },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: /View run error →$/ }),
    ).toBeVisible()
  },
}

export const FailedDark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}

/**
 * The conversation is not in this window: no door to it, the runtime is
 * "not seen" rather than an invented Idle, and the card says why.
 */
export const Disabled: Story = {
  args: { horse: horseFor(null), meterSlot: undefined, accessSlot: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: /Open →$/ })).toBeNull()
    await expect(canvas.getByText('conversation not loaded')).toBeVisible()
  },
}
