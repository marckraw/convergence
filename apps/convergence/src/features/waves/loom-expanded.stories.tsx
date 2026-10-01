import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { TooltipProvider } from '@convergence/ui'
import { LoomExpandedView } from './loom-expanded.presentational'
import { LoomRefreshView } from './loom-refresh.presentational'
import { loomSheets } from './loom-sheets.pure'
import { ledgerEntry } from './wave-rows.fixture'

/** The board's clock, fixed (MAR-3619). */
const NOW = Date.parse('2026-09-17T12:10:00.000Z')

const sheets = loomSheets(
  [
    ledgerEntry({
      issueIdentifier: 'MAR-3190',
      issueTitle: 'Loom: the label facts reach the ledger',
      state: 'done',
    }),
    ledgerEntry({
      issueIdentifier: 'MAR-3191',
      issueTitle: 'Loom: the Now sheet shows the horses',
      state: 'reviewed',
      trackerStatus: 'In Review',
    }),
    ledgerEntry({
      issueIdentifier: 'MAR-3210',
      issueTitle: 'Loom: search every sheet at once',
      state: 'assigned',
      seat: null,
    }),
  ],
  NOW,
)

const field = {
  value: '',
  onChange: fn(),
  onClear: fn(),
  onApply: fn(),
  revealed: false,
  onToggleReveal: fn(),
  onShortcut: fn(),
}

/**
 * Expanded Loom's rows carry the same contrast misses as the stack's: the
 * amber action words and muted status chips, and the amber outage line on
 * the light header.
 */
const lowContrastRows = {
  a11y: {
    config: {
      // a11y-known: Loom row action words, status chips and the amber outage line miss 4.5:1 (color-contrast) — fixed by the sweep (DS4)
      rules: [{ id: 'color-contrast', enabled: false }],
    },
  },
}

const meta = {
  title: 'Features/Waves/LoomExpanded',
  component: LoomExpandedView,
  args: {
    sheets,
    now: NOW,
    horses: [],
    qaExpanded: false,
    onToggleQa: fn(),
    header: { kind: 'live', text: null },
    refresh: (
      <LoomRefreshView label="read 2m ago" blocked={false} onRefresh={fn()} />
    ),
    subline: { text: 'convergence development', picker: null },
    field,
    search: null,
    open: 'now',
    onSelectSheet: fn(),
    inertReason: () => null,
    onOpen: fn(),
    onOpenGuide: fn(),
    onFold: fn(),
    onCollapse: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="relative flex h-160 w-275">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  parameters: { layout: 'padded' },
  beforeEach: () => {
    const realNow = Date.now
    Date.now = () => NOW
    return () => {
      Date.now = realNow
    }
  },
} satisfies Meta<typeof LoomExpandedView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Loom over the content area: the header carries the crew's line, the search
 * field, the guide, Fold and Collapse; the sheets lie side by side.
 */
export const Default: Story = {
  parameters: lowContrastRows,
  play: async ({ args, canvas, userEvent }) => {
    const loom = canvas.getByRole('region', { name: 'Loom' })
    await expect(
      within(loom).getByRole('heading', { name: 'Loom' }),
    ).toBeVisible()
    await expect(
      within(loom).getByRole('searchbox', { name: 'Search Loom' }),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'How Loom works' }),
    )
    await expect(args.onOpenGuide).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Fold Loom' }))
    await expect(args.onFold).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse Loom' }))
    await expect(args.onCollapse).toHaveBeenCalledOnce()
    // With nothing open in place, Escape folds Loom back into its column.
    await userEvent.keyboard('{Escape}')
    await expect(args.onFold).toHaveBeenCalledTimes(2)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** With a detail open, Escape is the container's: it closes that first. */
export const Escape: Story = {
  args: { onEscape: fn() },
  parameters: lowContrastRows,
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('searchbox', { name: 'Search Loom' }),
    )
    await userEvent.keyboard('{Escape}')
    await expect(args.onEscape).toHaveBeenCalledOnce()
    await expect(args.onFold).not.toHaveBeenCalled()
  },
}

/** The tracker stopped answering: the header line says so, and how long. */
export const Failed: Story = {
  args: {
    header: { kind: 'outage', text: 'tracker key refused · 12m' },
    refresh: undefined,
  },
  parameters: lowContrastRows,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'tracker key refused · 12m',
    )
  },
}
