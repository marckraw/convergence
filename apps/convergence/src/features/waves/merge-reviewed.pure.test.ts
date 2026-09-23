import { expect, it } from 'vitest'
import type { ReleaseAct, ReleasePlan } from '@/entities/release'
import { canMergeReviewed, mergeActWords } from './merge-reviewed.pure'

it('MAR-3087 stale selections, empty sets and running rites cannot merge', () => {
  const plan: ReleasePlan = {
    id: 'plan',
    candidates: [
      {
        issueId: 'issue',
        prNumber: 1,
        wave: null,
        url: 'https://github.com/example/repo/pull/1',
        headSha: 'a'.repeat(40),
        title: 'PR',
        mergeStateStatus: 'CLEAN',
        verify: 'SUCCESS',
        verdict: 'mergeable',
        mergeCommit: null,
      },
    ],
    unavailable: false,
    running: false,
    waitingFor: null,
    acts: [],
  }
  expect(canMergeReviewed(plan, ['issue'], false)).toBe(true)
  expect(canMergeReviewed(plan, ['stale'], false)).toBe(false)
  expect(canMergeReviewed(plan, [], false)).toBe(false)
  expect(canMergeReviewed(plan, ['issue'], true)).toBe(false)
  expect(canMergeReviewed({ ...plan, running: true }, ['issue'], false)).toBe(
    false,
  )
  expect(canMergeReviewed(null, ['issue'], false)).toBe(false)
})

it('MAR-3087 interrupted pending and running acts are distinct from completed failures', () => {
  const act: ReleaseAct = {
    id: 'act',
    crewId: 'crew',
    issueId: 'issue',
    prNumber: 1,
    headSha: 'a'.repeat(40),
    requestedAt: 'now',
    startedAt: null,
    completedAt: null,
    outcome: 'pending',
    error: null,
  }
  expect(mergeActWords(act, false)).toBe('interrupted — check GitHub')
  expect(mergeActWords(act, true)).toBe('pending')
  expect(mergeActWords({ ...act, outcome: 'running' }, false)).toBe(
    'interrupted — check GitHub',
  )
  expect(
    mergeActWords({ ...act, outcome: 'failed', error: 'refused' }, false),
  ).toBe('failed: refused')
})
