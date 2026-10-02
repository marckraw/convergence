import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, within } from 'storybook/test'
import { TooltipProvider } from '@convergence/ui'
import { LoomCompactView } from './loom-compact.presentational'
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
      issueIdentifier: 'MAR-3195',
      issueTitle: 'Loom: read an issue in place',
      state: 'working',
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

const meta = {
  title: 'Features/Waves/LoomCompact',
  component: LoomCompactView,
  args: {
    width: 320,
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
    onEscape: fn(),
    onExpand: fn(),
    onCollapse: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="flex h-180">
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
} satisfies Meta<typeof LoomCompactView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The column beside the conversation: Loom's name, Expand and Collapse, the
 * crew's line with the search icon, the tracker's word with Refresh, the
 * stack, and the guide at the foot.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const loom = canvas.getByRole('complementary', { name: 'Loom' })
    await expect(
      within(loom).getByRole('heading', { name: 'Loom' }),
    ).toBeVisible()
    await expect(loom).toHaveTextContent('convergence development')
    const toggle = canvas.getByRole('button', { name: 'Search Loom' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    await expect(args.field.onToggleReveal).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Expand Loom' }))
    await expect(args.onExpand).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse Loom' }))
    await expect(args.onCollapse).toHaveBeenCalledOnce()
    await userEvent.click(
      canvas.getByRole('button', { name: 'How Loom works' }),
    )
    await expect(args.onOpenGuide).toHaveBeenCalledOnce()
    // `/` anywhere in Loom outside a text field goes to the search field;
    // Escape is the container's to decide.
    await userEvent.keyboard('/')
    await expect(args.field.onShortcut).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    await expect(args.onEscape).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The search field revealed, holding a query: Enter applies, ✕ clears. */
export const Search: Story = {
  args: { field: { ...field, revealed: true, value: 'MAR-31' } },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', { name: 'Search Loom' }),
    ).toHaveAttribute('aria-expanded', 'true')
    const search = canvas.getByRole('search')
    const input = within(search).getByRole('searchbox', { name: 'Search Loom' })
    await expect(input).toHaveValue('MAR-31')
    await userEvent.type(input, '9')
    await expect(args.field.onChange).toHaveBeenLastCalledWith('MAR-319')
    await userEvent.keyboard('{Enter}')
    await expect(args.field.onApply).toHaveBeenCalledOnce()
    // Typing `/` in the field is a character, not the shortcut.
    await expect(args.field.onShortcut).not.toHaveBeenCalled()
    await userEvent.click(
      within(search).getByRole('button', { name: 'Clear search' }),
    )
    await expect(args.field.onClear).toHaveBeenCalledOnce()
  },
}

/** Several crews read a tracker: the crew's name is a picker, with Follow. */
export const CrewPicker: Story = {
  args: {
    subline: {
      text: 'convergence development',
      picker: {
        options: [
          { id: 'crew-1', name: 'convergence development' },
          { id: 'crew-2', name: 'backpack studio' },
        ],
        selectedId: 'crew-1',
        onSelect: fn(),
        follow: { on: false, onToggle: fn() },
      },
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    const picker = args.subline.picker!
    const follow = canvas.getByRole('button', {
      name: 'Follow the conversation',
    })
    await expect(follow).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(follow)
    await expect(picker.follow.onToggle).toHaveBeenCalledWith(true)
    const crew = canvas.getByRole('combobox', { name: 'Crew' })
    await expect(crew).toHaveTextContent('convergence development')
    await userEvent.click(crew)
    await userEvent.click(
      await screen.findByRole('option', { name: 'backpack studio' }),
    )
    await expect(picker.onSelect).toHaveBeenCalledWith('crew-2')
  },
}

/** The tracker stopped answering: the header says how long, as an age. */
export const Failed: Story = {
  args: {
    header: { kind: 'outage', text: 'tracker unreachable · 4m' },
    refresh: undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'tracker unreachable · 4m',
    )
    await expect(canvas.queryByRole('button', { name: 'Refresh' })).toBeNull()
  },
}

/** Still reading the tracker: the rows already held keep rendering. */
export const Busy: Story = {
  args: { header: { kind: 'reading', text: 'reading the tracker…' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'reading the tracker…',
    )
  },
}
