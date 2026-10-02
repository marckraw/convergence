import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { LoomDetailView } from './loom-detail.presentational'
import { loomIssueDetail } from './loom-detail.pure'
import { loomSheets } from './loom-sheets.pure'
import { ledgerEntry } from './wave-rows.fixture'

/** The board's clock, fixed (MAR-3619): the footer is an age measured against it. */
const NOW = Date.parse('2026-09-17T12:10:00.000Z')
const AT = '2026-09-17T12:00:00.000Z'

/** The conversation a detail can open; the view is generic over it. */
interface StorySession {
  id: string
  name: string
}

const conversation: StorySession = { id: 'session-opus', name: 'opus-mac' }

const entry = ledgerEntry({
  issueIdentifier: 'MAR-3195',
  issueTitle: 'Loom: read an issue in place, without leaving the panel',
  state: 'working',
  seat: 'opus-mac',
  lap: 2,
  fact: {
    logicalStatus: 'in-progress',
    branchName: 'agent/mar-3195',
    updatedAt: AT,
    labels: ['horse:opus-mac', 'wave:loom-p2', 'groomed', 'grounded'],
    summary:
      'A row opens its issue in place: what it is, what it means for you, where it is being worked, and the two doors out.',
  },
  pr: {
    number: 905,
    url: 'https://github.com/marckraw/convergence/pull/905',
    state: 'open',
    headBranch: 'agent/mar-3195',
    checkedAt: AT,
    source: 'gh',
    title: 'feat(loom): read an issue in place (MAR-3195)',
  },
})

const row = loomSheets([entry], NOW).now.inFlight[0]!

const openable = loomIssueDetail<StorySession>({
  row,
  opening: { openable: true, session: conversation },
  horse: null,
  lastOkAt: AT,
  now: NOW,
})

/** A row the tracker knows little about: no summary, labels, PR or conversation. */
const bare = loomIssueDetail<StorySession>({
  row: loomSheets(
    [
      ledgerEntry({
        issueIdentifier: 'MAR-3210',
        issueTitle: 'Loom: search every sheet at once',
        state: 'assigned',
        seat: null,
        sessionId: null,
      }),
    ],
    NOW,
  ).plan[0]!,
  opening: { openable: false, reason: 'no conversation for this seat' },
  horse: null,
  lastOkAt: null,
  now: NOW,
})

const meta = {
  title: 'Features/Waves/LoomDetail',
  component: LoomDetailView<StorySession>,
  args: {
    detail: openable,
    onClose: fn(),
    onOpenConversation: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-80 rounded-xl bg-surface p-2">
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
} satisfies Meta<typeof LoomDetailView<StorySession>>

export default meta

type Story = StoryObj<typeof meta>

/**
 * One issue, read in place: read-only facts, the PR and the issue as links
 * out, and Open conversation and Close as its only buttons.
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('heading', { name: args.detail.title }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('region', { name: 'Labels' }),
    ).toHaveTextContent('groomed')
    const pr = canvas.getByRole('link', { name: /PR #905/ })
    await expect(pr).toHaveAttribute(
      'href',
      'https://github.com/marckraw/convergence/pull/905',
    )
    await expect(
      // A TextLink that leaves the app says so to a screen reader.
      canvas.getByRole('link', {
        name: 'Open issue in Linear (opens in browser)',
      }),
    ).toHaveAttribute('href', args.detail.url)
    // Nothing here can be edited: no field, no checkbox, no select.
    await expect(canvas.queryByRole('textbox')).toBeNull()
    await expect(canvas.queryByRole('checkbox')).toBeNull()
    await expect(canvas.queryByRole('combobox')).toBeNull()
    await expect(canvas.getAllByRole('button')).toHaveLength(2)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open conversation →' }),
    )
    await expect(args.onOpenConversation).toHaveBeenCalledWith(conversation)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Close the issue detail' }),
    )
    await expect(args.onClose).toHaveBeenCalledOnce()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Nothing to show yet: each absence is said, never an empty line. */
export const Empty: Story = {
  args: { detail: bare },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No summary yet')).toBeVisible()
    await expect(canvas.getByText('No labels')).toBeVisible()
    await expect(
      canvas.getByText('no conversation for this seat'),
    ).toBeVisible()
    await expect(
      canvas.queryByRole('button', { name: 'Open conversation →' }),
    ).toBeNull()
    await expect(canvas.getByText('Read-only · Linear snapshot')).toBeVisible()
  },
}
