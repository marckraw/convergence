import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SessionAgentMeter } from '@/entities/agent-meter'
import { loomMasterminds, type LoomHorseSession } from './loom-horses.pure'
import { LoomMastermindCard } from './loom-mastermind.presentational'
import { loomSheets } from './loom-sheets.pure'
import { boundCrewWith, ledgerEntry, residentSeat } from './wave-rows.fixture'

/** The board's clock, fixed (MAR-3619). */
const NOW = Date.parse('2026-09-21T08:00:00.000Z')

const crew = boundCrewWith('crew-1', 'convergence development', [
  residentSeat('fable', { role: 'mastermind', hostPolicy: 'local' }),
])

/** Returned laps waiting for the mastermind's verdict. */
const returns = [3196, 3197].map((n) =>
  ledgerEntry({ issueIdentifier: `MAR-${n}`, state: 'returned', lap: 2 }),
)

/** The mastermind's card, built by the model the app builds it with. */
const mastermindFor = (
  session: LoomHorseSession | null,
  rows: Parameters<typeof loomSheets>[0] = returns,
) =>
  loomMasterminds({
    crews: [crew],
    sessionsById: new Map(session ? [['session-fable', session]] : []),
    sheets: loomSheets(rows, NOW),
    hostLabelOf: (id) => (id === 'local' ? 'This Mac' : id),
  })[0]!

const meta = {
  title: 'Features/Waves/LoomMastermind',
  component: LoomMastermindCard,
  args: {
    mastermind: mastermindFor({ status: 'running' }),
    meterSlot: (
      <SessionAgentMeter
        row={{
          sessionId: 'session-fable',
          account: 'Personal',
          usage: { cpu: 4, memoryMb: 238 },
        }}
      />
    ),
    onOpenSeat: fn(),
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
} satisfies Meta<typeof LoomMastermindCard>

export default meta

type Story = StoryObj<typeof meta>

/** The verdict seat: how many returns wait for it, and the door to it. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('button', { name: /^fable Working/ })
    await expect(card).toHaveAccessibleName(
      /2 returns wait for its verdict This Mac Open →$/,
    )
    await userEvent.click(card)
    await expect(args.onOpenSeat).toHaveBeenCalledWith('session-fable')
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** With several crews on screen the card names its crew. */
export const Long: Story = {
  args: { showCrewName: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('fable · convergence development'),
    ).toBeVisible()
  },
}

/** Nothing returned: the line says so rather than showing a zero. */
export const Empty: Story = {
  args: { mastermind: mastermindFor({ status: 'completed' }, []) },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Nothing waits for its verdict'),
    ).toBeVisible()
    await expect(canvas.getByText('Idle')).toBeVisible()
  },
}

/** Its conversation is not in this window: no door, and the runtime is unknown. */
export const Disabled: Story = {
  args: { mastermind: mastermindFor(null), meterSlot: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(canvas.getByText('Not seen')).toBeVisible()
  },
}
