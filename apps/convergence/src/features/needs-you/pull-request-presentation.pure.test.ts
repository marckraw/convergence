import { expect, it } from 'vitest'
import { cardFixtures } from './needs-you-card.fixture'
import { pullRequestPresentation } from './pull-request-presentation.pure'

it('prioritizes lifecycle over reviews, and never calls an open PR approved without a decision', () => {
  const pr = cardFixtures.open.pullRequest!
  expect(pullRequestPresentation(pr).label).toBe('Ready for review')
  expect(
    pullRequestPresentation({ ...pr, reviewDecision: 'CHANGES_REQUESTED' })
      .label,
  ).toBe('Changes requested')
  expect(
    pullRequestPresentation({ ...pr, reviewDecision: 'APPROVED' }).label,
  ).toBe('Approved')
  for (const [state, label] of [
    ['draft', 'Draft'],
    ['closed', 'Closed'],
    ['merged', 'Merged'],
  ] as const)
    expect(
      pullRequestPresentation({
        ...pr,
        state,
        reviewDecision: 'CHANGES_REQUESTED',
      }).label,
    ).toBe(label)
})

it('links only verified-shaped GitHub PR URLs and retains last-check evidence', () => {
  const pr = cardFixtures.open.pullRequest!
  expect(pullRequestPresentation(pr).href).toBe(pr.url)
  expect(pullRequestPresentation(pr).tooltip).toContain(pr.checkedAt)
  for (const url of [
    'javascript:alert(1)',
    'https://github.com.evil.test/org/repo/pull/1',
    'https://user@github.com/org/repo/pull/1',
    'file:///tmp/42',
  ])
    expect(pullRequestPresentation({ ...pr, url }).href).toBeNull()
})
