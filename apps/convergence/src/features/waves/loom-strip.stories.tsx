import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'
import { TooltipProvider } from '@convergence/ui'
import { loomSheets } from './loom-sheets.pure'
import { LoomStripView } from './loom-strip.presentational'
import { ledgerEntry } from './wave-rows.fixture'

/** The board's clock, fixed (MAR-3619): Before's count is a window over it. */
const NOW = Date.parse('2026-09-17T12:10:00.000Z')

const sheets = loomSheets(
  [
    ledgerEntry({ issueIdentifier: 'MAR-3180', state: 'done' }),
    ledgerEntry({ issueIdentifier: 'MAR-3181', state: 'done' }),
    ledgerEntry({ issueIdentifier: 'MAR-3195', state: 'working' }),
    ledgerEntry({ issueIdentifier: 'MAR-3191', state: 'reviewed' }),
    ledgerEntry({ issueIdentifier: 'MAR-3201', state: 'assigned' }),
    ledgerEntry({ issueIdentifier: 'MAR-3210', state: 'assigned', seat: null }),
    ledgerEntry({
      issueIdentifier: 'MAR-3211',
      state: 'unassigned',
      seat: null,
    }),
  ],
  NOW,
)

const meta = {
  title: 'Features/Waves/LoomStrip',
  component: LoomStripView,
  args: {
    sheets,
    now: NOW,
    horses: [],
    outage: false,
    onOpen: fn(),
    onExpand: fn(),
    onSelectSheet: fn(),
  },
  decorators: [
    (Story) => (
      // The app's one tooltip provider, at the root above the shell.
      <TooltipProvider>
        <div className="flex h-120">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  beforeEach: () => {
    const realNow = Date.now
    Date.now = () => NOW
    return () => {
      Date.now = realNow
    }
  },
} satisfies Meta<typeof LoomStripView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Loom folded: a door per sheet with its count, Open Loom at the top and
 * Expand at the foot. Each control is named, and its tooltip says the same.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const strip = canvas.getByRole('complementary', { name: 'Loom strip' })
    await expect(strip).toBeVisible()
    for (const name of ['Before: 2', 'Now: 2', 'Next: 1', 'Plan: 1']) {
      await expect(canvas.getByRole('button', { name })).toBeVisible()
    }
    await userEvent.click(canvas.getByRole('button', { name: 'Next: 1' }))
    await expect(args.onSelectSheet).toHaveBeenCalledWith('next')
    const open = canvas.getByRole('button', { name: 'Open Loom' })
    await userEvent.hover(open)
    await expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Open Loom',
    )
    await userEvent.click(open)
    await expect(args.onOpen).toHaveBeenCalledOnce()
    await userEvent.unhover(open)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    await userEvent.click(canvas.getByRole('button', { name: 'Expand Loom' }))
    await expect(args.onExpand).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The tracker stopped answering: the strip shows the outage dot, named. */
export const Failed: Story = {
  args: { outage: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('status', { name: 'Tracker not answering' }),
    ).toBeInTheDocument()
  },
}

/** Nothing on the tracker yet: four zeros, every door still opens its sheet. */
export const Empty: Story = {
  args: { sheets: loomSheets([], NOW) },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Plan: 0' }))
    await expect(args.onSelectSheet).toHaveBeenCalledWith('plan')
  },
}
