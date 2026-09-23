import { expect, it } from 'vitest'
import { mergeVerdict, reviewedByWave } from './release-act.pure'
import { parseMergeReading } from '../pull-request/github-cli.pure'
import { diffTrackerSnapshot } from '../tracker/tracker-watcher.pure'
import { trackerIssue } from '../tracker/linear-tracker.fixture'
import { HEAD, reading, releaseBench } from './release-act.fixture'

it('MAR-3360 R1 a merge commit is merged even when GitHub reports UNKNOWN', () => {
  expect(
    mergeVerdict(
      parseMergeReading(
        reading({
          mergeStateStatus: 'UNKNOWN',
          mergeCommit: { oid: '512a3ef632a675195826bed1e4ce29b939bfd2f2' },
        }),
      ),
    ),
  ).toBe('merged 512a3ef')
})

it('MAR-3087 parser gates missing, pending, failed and duplicate verify checks', () => {
  for (const [checks, verdict] of [
    [[], 'verify missing'],
    [
      [{ name: 'verify', status: 'IN_PROGRESS', conclusion: 'SUCCESS' }],
      'verify IN_PROGRESS',
    ],
    [[{ context: 'verify', state: 'SUCCESS' }], 'mergeable'],
    [
      [
        { name: 'verify', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'verify', status: 'COMPLETED', conclusion: 'FAILURE' },
      ],
      'verify FAILURE',
    ],
  ] as const)
    expect(
      mergeVerdict(parseMergeReading(reading({ statusCheckRollup: checks }))),
    ).toBe(verdict)
  expect(
    mergeVerdict(parseMergeReading(reading({ mergeStateStatus: 'UNKNOWN' }))),
  ).toBe('not CLEAN: UNKNOWN')
  expect(mergeVerdict(parseMergeReading(reading({ headRefOid: '' })))).toBe(
    'head SHA missing',
  )
})

it('MAR-3087 candidates keep first wave order and within-wave row order, including no wave', () => {
  const b = releaseBench(4)
  try {
    const rows = b.deps.ledger.list().map((row, index) => ({
      ...row,
      wave: ['two', null, 'one', 'two'][index],
    }))
    expect(reviewedByWave(rows).map((row) => row.issueId)).toEqual([
      'issue-1',
      'issue-4',
      'issue-2',
      'issue-3',
    ])
    expect(
      reviewedByWave(rows.map((row) => ({ ...row, blocked: true }))),
    ).toEqual([])
    expect(reviewedByWave(rows.map((row) => ({ ...row, pr: null })))).toEqual(
      [],
    )
  } finally {
    b.db.close()
  }
})

it('MAR-3087 tracker observations and stored reads retain the merged fact without changing QA ownership', () => {
  const b = releaseBench()
  try {
    const current = b.ledger.currentView('crew')[0]
    b.ledger.append([
      {
        ...current,
        seenAt: '2026-09-23T00:00:00Z',
        fact: { ...current.fact, merged: { headSha: HEAD, prNumber: 1 } },
      },
    ])
    const saved = b.ledger.currentView('crew')[0]
    expect(saved.fact.merged).toEqual({ headSha: HEAD, prNumber: 1 })
    const [next] = diffTrackerSnapshot({
      crewId: 'crew',
      current: [saved],
      seenAt: '2026-09-24T00:00:00Z',
      issues: [
        trackerIssue({ id: 'issue-1', status: 'Done', logicalStatus: 'done' }),
      ],
    })
    expect(next.fact.merged).toEqual(saved.fact.merged)
    expect(saved.state).toBe('reviewed')
    expect(next.state).toBe('done')
  } finally {
    b.db.close()
  }
})
