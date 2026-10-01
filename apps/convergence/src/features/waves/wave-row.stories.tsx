import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { loomSheets } from './loom-sheets.pure'
import { WaveRowView } from './wave-row.presentational'
import { ledgerEntry } from './wave-rows.fixture'

/** The board's clock, fixed: the rows' host markers are ages measured against it. */
const NOW = Date.parse('2026-09-17T12:10:00.000Z')

/** A Loom row, built by the real selectors, as the sheets build them. */
const rowOf = (entry: ReturnType<typeof ledgerEntry>) => {
  const sheets = loomSheets([entry], NOW)
  return [
    ...sheets.before,
    ...sheets.now.inFlight,
    ...sheets.now.awaitingQa,
    ...sheets.now.fablesTurn,
    ...sheets.now.decide,
    ...sheets.next,
    ...sheets.plan,
  ][0]!
}

const working = rowOf(
  ledgerEntry({
    issueIdentifier: 'MAR-3085',
    issueTitle: 'Loom: carry the blocked label through the tracker adapter',
    state: 'working',
    trackerStatus: 'In Progress',
    seat: 'opus-mac',
    lap: 2,
    fact: {
      logicalStatus: 'in-progress',
      branchName: 'agent/mar-3085',
      updatedAt: null,
      labels: ['horse:opus-mac', 'wave:loom-p2'],
    },
    pr: {
      number: 905,
      url: 'https://github.com/marckraw/convergence/pull/905',
      state: 'open',
      headBranch: 'agent/mar-3085',
      checkedAt: '2026-09-17T12:00:00.000Z',
      source: 'gh',
    },
  }),
)

/**
 * The openable card is a `role="button"` with the PR link inside it, so axe
 * sees a control nested in a control. Only the stories that draw the PR door.
 */
const prDoorInsideCard = {
  a11y: {
    config: {
      // a11y-known: the PR link sits inside the row's role="button" (nested-interactive) — fixed by the sweep (DS4)
      rules: [{ id: 'nested-interactive', enabled: false }],
    },
  },
}

const meta = {
  title: 'Features/Waves/WaveRow',
  component: WaveRowView,
  args: {
    appearance: 'loom',
    row: working,
    inertReason: null,
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
} satisfies Meta<typeof WaveRowView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * A Loom card: the identifier, the title, the row's facts and its PR. The card
 * opens its seat by click and by keyboard; the PR is its own door to GitHub.
 */
export const Default: Story = {
  parameters: prDoorInsideCard,
  play: async ({ args, canvas, userEvent }) => {
    const card = canvas.getByRole('button', { name: /MAR-3085/ })
    await expect(card).toHaveTextContent('Linear: In Progress')
    const pr = canvas.getByRole('link', {
      name: 'PR #905 open, opens on GitHub',
    })
    await expect(pr).toHaveAttribute(
      'href',
      'https://github.com/marckraw/convergence/pull/905',
    )
    await expect(pr).toHaveAttribute('target', '_blank')
    await userEvent.click(card)
    await expect(args.onOpen).toHaveBeenCalledWith(args.row.entry)
    await userEvent.tab({ shift: true })
    await userEvent.tab()
    await expect(card).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onOpen).toHaveBeenCalledTimes(2)
    // Enter on the PR link belongs to the link, not the card.
    await userEvent.tab()
    await expect(pr).toHaveFocus()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** The panel's plain list row, outside Loom's card look. */
export const List: Story = {
  args: { appearance: undefined },
  parameters: prDoorInsideCard,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /MAR-3085/ })).toBeVisible()
    await expect(canvas.queryByText('Linear: In Progress')).toBeNull()
  },
}

/** A long title is clamped, and the whole of it is one hover away. */
export const Long: Story = {
  args: {
    row: rowOf(
      ledgerEntry({
        issueIdentifier: 'MAR-3155',
        issueTitle:
          'Loom: the identifier never breaks after its dash, the title takes the rest of the row and wraps onto a second line before it is cut short, whatever the column width',
        state: 'working',
      }),
    ),
  },
  play: async ({ args, canvas }) => {
    const title = canvas.getByText(args.row.entry.issueTitle)
    await expect(title).toHaveAttribute('title', args.row.entry.issueTitle)
    await expect(canvas.getByText('MAR-3155')).toBeVisible()
  },
}

/** A row whose seat has no conversation is inert, and says why. */
export const Disabled: Story = {
  args: { inertReason: 'no conversation for this seat' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button')).toBeNull()
    await expect(
      canvas.getByText('no conversation for this seat'),
    ).toBeVisible()
    // An inert row still names its PR, as text rather than a door.
    await expect(canvas.queryByRole('link')).toBeNull()
    await expect(canvas.getByText(/PR #905 open/)).toBeVisible()
  },
}

/** Blocked, on a host that stopped answering: the row says both. */
export const Failed: Story = {
  args: {
    row: rowOf(
      ledgerEntry({
        issueIdentifier: 'MAR-3138',
        issueTitle: 'Decide whether the lap cap stops a returned issue',
        state: 'working',
        blocked: true,
        hostLiveness: {
          executionHost: 'little-monster',
          lastEventAt: '2026-09-17T12:02:00.000Z',
          hostReachable: false,
        },
      }),
    ),
  },
  play: async ({ canvas }) => {
    const card = canvas.getByRole('button', { name: /MAR-3138/ })
    await expect(card).toHaveTextContent('blocked')
    await expect(card).toHaveTextContent('decide')
  },
}

export const FailedDark: Story = {
  ...Failed,
  globals: { theme: 'dark' },
}
