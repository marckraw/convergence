import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { Button } from '@convergence/ui'
import { loomSheets } from './loom-sheets.pure'
import { WaveSectionView } from './wave-section.presentational'
import { ledgerEntry } from './wave-rows.fixture'

/** The board's clock, fixed: the sheets are a window over it. */
const NOW = Date.parse('2026-09-17T12:10:00.000Z')

const reviewed = loomSheets(
  [
    ledgerEntry({
      issueIdentifier: 'MAR-3191',
      issueTitle: 'Loom: the Now sheet shows the horses',
      state: 'reviewed',
      trackerStatus: 'In Review',
    }),
    ledgerEntry({
      issueIdentifier: 'MAR-3192',
      issueTitle: 'Loom: Before groups by wave, newest first',
      state: 'reviewed',
      trackerStatus: 'In Review',
    }),
    ledgerEntry({
      issueIdentifier: 'MAR-3193',
      issueTitle: 'Loom: Next splits ready from preparing',
      state: 'reviewed',
      trackerStatus: 'In Review',
    }),
  ],
  NOW,
).now.awaitingQa

const meta = {
  title: 'Features/Waves/WaveSection',
  component: WaveSectionView,
  args: {
    appearance: 'loom',
    title: 'Awaiting QA',
    rows: reviewed,
    inertReason: (): string | null => null,
    onOpen: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex w-80 flex-col">
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
} satisfies Meta<typeof WaveSectionView>

export default meta

type Story = StoryObj<typeof meta>

/** A titled section that counts its rows; each row opens its seat. */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const section = canvas.getByRole('region', { name: 'Awaiting QA' })
    await expect(
      within(section).getByRole('heading', { name: 'Awaiting QA · 3' }),
    ).toBeVisible()
    await userEvent.click(
      within(section).getByRole('button', { name: /MAR-3192/ }),
    )
    await expect(args.onOpen).toHaveBeenCalledWith(args.rows[1]!.entry)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/**
 * A preview of a longer list: the heading counts what the section HAS, a hint
 * says what the section is for, and the section's own control sits inside it.
 */
export const Long: Story = {
  args: {
    rows: reviewed.slice(0, 2),
    count: 12,
    hint: 'QA and say done, by name',
    footer: (
      <Button type="button" variant="ghost">
        Show all 12 awaiting QA
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Awaiting QA · 12' }),
    ).toBeVisible()
    await expect(canvas.getByText('QA and say done, by name')).toBeVisible()
    await expect(canvas.getAllByRole('button', { name: /MAR-/ })).toHaveLength(
      2,
    )
  },
}

/** A wave group starts closed in the narrow column, with its name and count. */
export const Disclosure: Story = {
  args: { title: 'loom-p2', disclosure: 'closed' },
  play: async ({ canvas, userEvent }) => {
    // A Collapsible section (MC-17): data-open says whether it is open.
    const group = canvas.getByRole('region', { name: 'loom-p2' })
    await expect(group).not.toHaveAttribute('data-open')
    await expect(
      within(group).queryByRole('button', { name: /MAR-3191/, hidden: true }),
    ).not.toBeVisible()
    await userEvent.click(within(group).getByText('loom-p2 · 3'))
    await expect(group).toHaveAttribute('data-open')
    // The panel grows open (Collapsible's motion): visible once it has.
    await waitFor(() =>
      expect(
        within(group).getByRole('button', { name: /MAR-3191/ }),
      ).toBeVisible(),
    )
  },
}

/** A section with no rows draws nothing at all. */
export const Empty: Story = {
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('section')).toBeNull()
    await expect(canvasElement.querySelector('details')).toBeNull()
  },
}

/** Rows that cannot open their seat are inert, and say why. */
export const Disabled: Story = {
  args: { inertReason: () => 'conversation not loaded' },
  play: async ({ canvas }) => {
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
    await expect(canvas.getAllByText('conversation not loaded')).toHaveLength(3)
  },
}
