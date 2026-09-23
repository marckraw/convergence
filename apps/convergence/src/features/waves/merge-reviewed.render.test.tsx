import { afterEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { releaseApi, type ReleasePlan } from '@/entities/release'
import { MergeReviewedView } from './merge-reviewed.presentational'
import { MergeReviewed } from './merge-reviewed.container'
import { LoomSheetView } from './loom-sheet.presentational'
import { loomSheets } from './loom-sheets.pure'
import { ledgerEntry } from './wave-rows.fixture'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
const plan: ReleasePlan = {
  id: 'plan',
  unavailable: false,
  running: false,
  waitingFor: null,
  acts: [],
  candidates: [
    {
      url: 'https://github.com/example/repo/pull/1',
      issueId: 'one',
      prNumber: 1,
      title: 'First PR',
      wave: 'wave-two',
      headSha: 'abcdef1234',
      mergeStateStatus: 'CLEAN',
      verify: 'SUCCESS',
      verdict: 'mergeable',
      mergeCommit: null,
    },
    {
      url: 'https://github.com/example/repo/pull/2',
      issueId: 'two',
      prNumber: 2,
      title: 'Second PR',
      wave: null,
      headSha: '1111111111',
      mergeStateStatus: 'DIRTY',
      verify: 'SUCCESS',
      verdict: 'not CLEAN: DIRTY',
      mergeCommit: null,
    },
  ],
}
const props = {
  open: true,
  enabled: true,
  plan,
  selected: ['one', 'two'],
  busy: false,
  error: null,
  onOpenChange: vi.fn(),
  onToggle: vi.fn(),
  onRefresh: vi.fn(),
  onMerge: vi.fn(),
}

const mergedRows = [2, 3, 4].map((prNumber) => ({
  ...plan.candidates[0],
  issueId: `merged-${prNumber}`,
  prNumber,
  mergeStateStatus: 'UNKNOWN',
  mergeCommit: 'ccccccc1234',
  verdict: 'merged ccccccc',
}))

it('MAR-3360 R2 three merged rows and one mergeable count only the mergeable selection', () => {
  render(
    <MergeReviewedView
      {...props}
      plan={{ ...plan, candidates: [plan.candidates[0], ...mergedRows] }}
      selected={['one', ...mergedRows.map((row) => row.issueId)]}
    />,
  )
  expect(screen.getByRole('button', { name: 'Merge 1' })).toBeTruthy()
  expect(screen.getByRole('checkbox', { name: 'Select PR #1' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Select PR #1' })).toBeEnabled()
  const summary = screen.getByText('Already merged · 3')
  expect(summary.closest('details')).not.toHaveAttribute('open')
  fireEvent.click(summary)
  for (const row of mergedRows) {
    const checkbox = screen.getByLabelText(`Select PR #${row.prNumber}`)
    expect(checkbox).not.toBeChecked()
    expect(checkbox).toBeDisabled()
  }
})

it('MAR-3360 R2 only merged rows show the summary and disabled Nothing to merge', () => {
  render(
    <MergeReviewedView
      {...props}
      plan={{ ...plan, candidates: mergedRows }}
      selected={mergedRows.map((row) => row.issueId)}
    />,
  )
  expect(
    screen.getByRole('button', { name: 'Nothing to merge' }),
  ).toBeDisabled()
  expect(
    screen.getByText('Nothing to merge — every reviewed PR is already merged.'),
  ).toBeTruthy()
  expect(screen.getByText('Already merged · 3')).toBeTruthy()
})

it('MAR-3360 R2 opening a mixed plan selects and submits only the mergeable issue', async () => {
  vi.spyOn(releaseApi, 'plan').mockResolvedValue({
    ...plan,
    candidates: [plan.candidates[0], ...mergedRows],
  })
  vi.spyOn(releaseApi, 'acts').mockResolvedValue({
    acts: [],
    running: false,
    waitingFor: null,
  })
  const merge = vi
    .spyOn(releaseApi, 'merge')
    .mockResolvedValue({ acts: [], running: false, waitingFor: null })
  render(
    <MergeReviewed
      seat={{ crewId: 'crew', sessionId: 'mastermind' }}
      enabled
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Merge reviewed…' }))
  const button = await screen.findByRole('button', { name: 'Merge 1' })
  expect(button).toBeEnabled()
  fireEvent.click(button)
  expect(merge).toHaveBeenCalledExactlyOnceWith({
    crewId: 'crew',
    sessionId: 'mastermind',
    planId: 'plan',
    issueIds: ['one'],
  })
  expect(
    await screen.findByRole('button', { name: 'Nothing to merge' }),
  ).toBeDisabled()
})

it('MAR-3087 sheet groups waves, shows all readings and enables a mergeable partial selection', () => {
  const view = render(<MergeReviewedView {...props} />)
  expect(
    screen
      .getAllByRole('region')
      .map((node) => node.getAttribute('aria-label')),
  ).toEqual(['wave-two', 'no wave'])
  expect(screen.getByText('abcdef1 · CLEAN · verify SUCCESS')).toBeTruthy()
  expect(screen.getByText('not CLEAN: DIRTY')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Merge 1' })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'Select PR #2' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select PR #1' }))
  expect(props.onToggle).toHaveBeenCalledWith('one')
  view.rerender(<MergeReviewedView {...props} selected={['one']} />)
  fireEvent.click(screen.getByRole('button', { name: 'Merge 1' }))
  expect(props.onMerge).toHaveBeenCalledOnce()
})

it('MAR-3087 R7 missing gh disables the merge and says merge by hand', () => {
  render(
    <MergeReviewedView
      {...props}
      selected={['one']}
      plan={{ ...plan, unavailable: true }}
    />,
  )
  expect(screen.getByText('gh not found — merge by hand')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Merge 1' })).toBeDisabled()
})

it('MAR-3087 sheet exposes bot waiting and interrupted records', () => {
  const act = {
    id: 'act',
    crewId: 'crew',
    issueId: 'one',
    prNumber: 1,
    headSha: 'abcdef1234',
    requestedAt: 'now',
    startedAt: 'now',
    completedAt: null,
    outcome: 'running' as const,
    error: null,
  }
  const view = render(
    <MergeReviewedView
      {...props}
      plan={{ ...plan, acts: [act], running: true, waitingFor: 1 }}
    />,
  )
  expect(screen.getByText('#1: waiting for the changesets run…')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Merge 1' })).toBeDisabled()
  view.rerender(
    <MergeReviewedView {...props} plan={{ ...plan, acts: [act] }} />,
  )
  expect(screen.getByText('#1 · interrupted — check GitHub')).toBeTruthy()
})

it('MAR-3087 Awaiting QA owns the action and retains the reviewed row with merged sha7', () => {
  const entry = ledgerEntry({
    issueIdentifier: 'MAR-3087',
    state: 'reviewed',
    fact: {
      logicalStatus: 'in-review',
      branchName: null,
      updatedAt: null,
      merged: { headSha: 'abcdef1234', prNumber: 1 },
    },
  })
  const base = {
    sheets: loomSheets([entry], 0),
    now: 0,
    horses: [],
    qaExpanded: true,
    onToggleQa: vi.fn(),
    inertReason: () => null,
    onOpen: vi.fn(),
  }
  const view = render(
    <LoomSheetView
      {...base}
      sheet="now"
      mergeReviewed={<button>Merge reviewed…</button>}
    />,
  )
  const group = screen.getByRole('region', { name: 'Awaiting QA' })
  expect(
    within(group).getByRole('button', { name: 'Merge reviewed…' }),
  ).toBeTruthy()
  expect(group.textContent).toContain('merged abcdef1')
  expect(group.textContent).toContain('reviewed')
  view.rerender(<LoomSheetView {...base} sheet="now" />)
  expect(screen.queryByRole('button', { name: 'Merge reviewed…' })).toBeNull()
  view.rerender(
    <LoomSheetView
      {...base}
      sheet="plan"
      mergeReviewed={<button>Merge reviewed…</button>}
    />,
  )
  expect(screen.queryByRole('button', { name: 'Merge reviewed…' })).toBeNull()
})
