import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { ReleaseCandidate, ReleasePlan } from '@/entities/release'
import { MergeReviewedView } from './merge-reviewed.presentational'

const candidate = (
  overrides: Partial<ReleaseCandidate> &
    Pick<ReleaseCandidate, 'issueId' | 'prNumber'>,
): ReleaseCandidate => ({
  url: `https://github.com/marckraw/convergence/pull/${overrides.prNumber}`,
  title: `Pull request ${overrides.prNumber}`,
  wave: 'loom-p2',
  headSha: 'abcdef1234567',
  mergeStateStatus: 'CLEAN',
  verify: 'SUCCESS',
  verdict: 'mergeable',
  mergeCommit: null,
  ...overrides,
})

const plan: ReleasePlan = {
  id: 'plan-1',
  unavailable: false,
  running: false,
  waitingFor: null,
  acts: [],
  candidates: [
    candidate({
      issueId: 'issue-3191',
      prNumber: 901,
      title: 'feat(loom): the Now sheet shows the horses (MAR-3191)',
    }),
    candidate({
      issueId: 'issue-3192',
      prNumber: 902,
      title: 'feat(loom): Before groups by wave (MAR-3192)',
      wave: null,
      headSha: '1111111222222',
      mergeStateStatus: 'DIRTY',
      verdict: 'not CLEAN: DIRTY',
    }),
  ],
}

/** Three already merged, one still to merge, and a merge on its way. */
const mergedRows = [895, 896, 897].map((prNumber) =>
  candidate({
    issueId: `issue-merged-${prNumber}`,
    prNumber,
    title: `fix(loom): an earlier slice (#${prNumber})`,
    mergeStateStatus: 'UNKNOWN',
    mergeCommit: 'ccccccc1234',
    verdict: 'merged ccccccc',
  }),
)

const meta = {
  title: 'Features/Waves/MergeReviewed',
  component: MergeReviewedView,
  args: {
    open: true,
    enabled: true,
    plan,
    selected: ['issue-3191'],
    busy: false,
    error: null,
    onOpenChange: fn(),
    onToggle: fn(),
    onRefresh: fn(),
    onMerge: fn(),
  },
} satisfies Meta<typeof MergeReviewedView>

export default meta

type Story = StoryObj<typeof meta>

/**
 * The reviewed PRs, by wave: only a mergeable row can be ticked, and the
 * button counts the mergeable selection.
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', { name: 'Merge reviewed' })
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(
      within(dialog).getByRole('region', { name: 'loom-p2' }),
    ).toHaveTextContent('#901')
    const first = within(dialog).getByRole('checkbox', {
      name: 'Select PR #901',
    })
    await expect(first).toBeChecked()
    const dirty = within(dialog).getByRole('checkbox', {
      name: 'Select PR #902',
    })
    await expect(dirty).toBeDisabled()
    await expect(dirty).not.toBeChecked()
    await userEvent.click(first)
    await expect(args.onToggle).toHaveBeenCalledWith('issue-3191')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Merge 1' }),
    )
    await expect(args.onMerge).toHaveBeenCalledOnce()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Refresh' }),
    )
    await expect(args.onRefresh).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}

/** Closed: the trigger beside Awaiting QA opens the dialog. */
export const Closed: Story = {
  args: { open: false },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Merge reviewed…' }),
    )
    await expect(args.onOpenChange).toHaveBeenCalledWith(true)
  },
}

/** Nothing reviewed has a PR to merge: the trigger is off. */
export const Disabled: Story = {
  args: { open: false, enabled: false },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Merge reviewed…' }),
    ).toBeDisabled()
  },
}

/** Reading the PRs: the dialog says so and offers nothing to merge yet. */
export const Busy: Story = {
  args: { plan: null, selected: [] },
  play: async () => {
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(within(dialog).getByText('Reading PRs…')).toBeVisible()
    await expect(
      within(dialog).getByRole('button', { name: 'Nothing to merge' }),
    ).toBeDisabled()
  },
}

/** The read failed: the error is said, and Refresh tries again. */
export const Failed: Story = {
  args: { plan: null, selected: [], error: 'gh exited 1: not logged in' },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog')
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'gh exited 1: not logged in',
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Refresh' }),
    )
    await expect(args.onRefresh).toHaveBeenCalledOnce()
  },
}

/** No reviewed PRs at all. */
export const Empty: Story = {
  args: { plan: { ...plan, candidates: [] }, selected: [] },
  play: async () => {
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(
      within(dialog).getByText('No reviewed PRs awaiting merge.'),
    ).toBeVisible()
  },
}

/**
 * Merging: the merged rows fold away under their count, and each act says
 * where it is while the run goes.
 */
export const Long: Story = {
  args: {
    busy: true,
    plan: {
      ...plan,
      running: true,
      candidates: [plan.candidates[0]!, ...mergedRows],
      acts: [
        {
          id: 'act-1',
          crewId: 'crew-1',
          issueId: 'issue-3191',
          prNumber: 901,
          headSha: 'abcdef1234567',
          requestedAt: '2026-09-17T12:00:00.000Z',
          startedAt: '2026-09-17T12:00:01.000Z',
          completedAt: null,
          outcome: 'running',
          error: null,
        },
      ],
    },
  },
  play: async () => {
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toBeVisible())
    await expect(within(dialog).getByText('Already merged · 3')).toBeVisible()
    await expect(
      within(dialog).getByText('Merging reviewed PRs…'),
    ).toBeVisible()
    await expect(within(dialog).getByText('#901 · running')).toBeVisible()
    await expect(
      within(dialog).getByRole('button', { name: 'Refresh' }),
    ).toBeDisabled()
  },
}
