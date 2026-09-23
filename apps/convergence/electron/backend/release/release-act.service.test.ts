import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReleaseActService } from './release-act.service'
import {
  HEAD,
  MERGED,
  MOVED,
  reading,
  releaseBench,
  seat,
} from './release-act.fixture'

const benches: ReturnType<typeof releaseBench>[] = []
const bench = (count = 1) => {
  const value = releaseBench(count)
  benches.push(value)
  return value
}
afterEach(() => {
  for (const value of benches.splice(0)) value.db.close()
})

it('MAR-3360 R1 plans a merged reading without a ledger merged fact', async () => {
  const b = bench()
  expect(b.deps.ledger.list()[0].fact.merged).toBeUndefined()
  vi.spyOn(b.deps.prs, 'viewForMerge').mockResolvedValue({
    url: 'https://github.com/example/repo/pull/1',
    headSha: HEAD,
    title: 'Already merged',
    mergeStateStatus: 'UNKNOWN',
    verify: 'SUCCESS',
    mergeCommit: MERGED,
  })
  const plan = await b.service.plan(seat)
  expect(plan.candidates[0].verdict).toBe('merged ccccccc')
  await expect(
    b.service.merge({ ...seat, planId: plan.id, issueIds: ['issue-1'] }),
  ).rejects.toThrow('Select mergeable PRs only')
  expect(b.service.acts(seat).acts).toEqual([])
  expect(b.gh).not.toHaveBeenCalled()
})

it('MAR-3360 a current merge commit takes precedence over an interrupted act and stale ledger SHA', async () => {
  const b = bench()
  const current = b.ledger.currentView('crew')[0]
  b.ledger.append([
    {
      ...current,
      seenAt: '2026-09-23T00:00:00Z',
      fact: { ...current.fact, merged: { headSha: HEAD, prNumber: 1 } },
    },
  ])
  b.db
    .prepare(
      "INSERT INTO release_acts (id, crew_id, kind, issue_id, pr_number, head_sha, requested_at, outcome) VALUES ('interrupted', 'crew', 'merge', 'issue-1', 1, ?, 'now', 'running')",
    )
    .run(HEAD)
  b.gh.mockResolvedValue(
    reading({ mergeStateStatus: 'UNKNOWN', mergeCommit: { oid: MERGED } }),
  )
  const plan = await b.service.plan(seat)
  expect(plan.candidates[0].verdict).toBe('merged ccccccc')
  expect(plan.acts[0].outcome).toBe('running')
})

describe('MAR-3087 merge rite, fake gh only', () => {
  it('R1/R2 CLEAN twice merges with --merge and the second read head, then records the fact', async () => {
    const b = bench()
    const result = await b.merge()
    expect(result.acts[0].outcome).toBe('merged')
    expect(b.gh.mock.calls.filter(([args]) => args[1] === 'merge')).toEqual([
      [
        ['pr', 'merge', '1', '--merge', '--match-head-commit', HEAD],
        '/fake/repository',
      ],
    ])
    expect(
      b.events
        .slice(0, 3)
        .map((value) => value.split(' ').slice(0, 3).join(' ')),
    ).toEqual(['pr view 1', 'pr view 1', 'pr merge 1'])
    expect(b.ledger.currentView('crew')[0]).toMatchObject({
      state: 'reviewed',
      fact: { merged: { headSha: HEAD, prNumber: 1 } },
    })
  })

  it.each([
    ['BLOCKED', { mergeStateStatus: 'BLOCKED' }, 'not CLEAN: BLOCKED'],
    ['missing', { statusCheckRollup: [] }, 'verify missing'],
    [
      'FAILURE',
      {
        statusCheckRollup: [
          { name: 'verify', status: 'COMPLETED', conclusion: 'FAILURE' },
        ],
      },
      'verify FAILURE',
    ],
    [
      'wrong repository',
      { url: 'https://github.com/other/repo/pull/1' },
      'PR repository mismatch',
    ],
    ['moved', { headRefOid: MOVED }, 'head SHA moved'],
  ])(
    'R1/R2 rereads and skips %s after a CLEAN plan',
    async (_name, patch, error) => {
      const b = bench()
      b.gh
        .mockResolvedValueOnce(reading())
        .mockResolvedValueOnce(reading(patch))
      const result = await b.merge()
      expect(result.acts[0]).toMatchObject({ outcome: 'skipped', error })
      expect(b.gh.mock.calls.some(([args]) => args[1] === 'merge')).toBe(false)
    },
  )

  it('R1 plan-time refusal cannot be bypassed by calling merge directly', async () => {
    const b = bench()
    b.gh.mockResolvedValueOnce(reading({ statusCheckRollup: [] }))
    await expect(b.merge()).rejects.toThrow('Select mergeable PRs only')
    expect(b.service.acts(seat).acts).toEqual([])
  })

  it('R3 second merge follows the matching completed poll, ignoring other heads', async () => {
    const b = bench(2)
    let poll = 0
    b.gh.mockImplementation(async (args) => {
      if (args[0] === 'run') {
        poll++
        const status = poll < 3 ? 'in_progress' : 'completed'
        b.events.push(`poll:${poll}:${status}`)
        return JSON.stringify([
          {
            headSha: poll === 1 ? MOVED : MERGED,
            status: poll === 1 ? 'completed' : status,
            conclusion: 'success',
          },
        ])
      }
      b.events.push(args.slice(0, 3).join(' '))
      return args[1] === 'merge'
        ? ''
        : reading({
            url: `https://github.com/example/repo/pull/${args[2]}`,
            mergeCommit: b.events.includes(`pr merge ${args[2]}`)
              ? { oid: MERGED }
              : null,
          })
    })
    await b.merge()
    expect(b.events.indexOf('poll:3:completed')).toBeGreaterThan(
      b.events.indexOf('pr merge 1'),
    )
    expect(b.events.indexOf('pr merge 2')).toBeGreaterThan(
      b.events.indexOf('poll:3:completed'),
    )
    expect(b.deps.sleep.mock.calls).toEqual([[10_000], [10_000]])
  })

  it.each(['timeout', 'failure'])(
    'R3 %s stops the queue after the first merge and retains its fact',
    async (mode) => {
      const b = bench(2)
      b.gh.mockImplementation(async (args) =>
        args[0] === 'run'
          ? JSON.stringify([
              {
                headSha: MERGED,
                status: mode === 'timeout' ? 'in_progress' : 'completed',
                conclusion: 'failure',
              },
            ])
          : args[1] === 'merge'
            ? ''
            : reading({
                url: `https://github.com/example/repo/pull/${args[2]}`,
                mergeCommit: b.service
                  .acts(seat)
                  .acts.some(
                    (act) =>
                      act.prNumber === Number(args[2]) &&
                      act.outcome === 'merged',
                  )
                  ? { oid: MERGED }
                  : null,
              }),
      )
      const result = await b.merge()
      expect(result.acts.map((act) => act.outcome)).toEqual([
        'merged',
        'skipped',
      ])
      expect(result.acts[0].error).toBe(
        mode === 'timeout'
          ? 'changesets run did not complete'
          : 'changesets run failure',
      )
      expect(result.acts[0].completedAt).toBe(result.acts[0].startedAt)
      expect(b.hails.raise).toHaveBeenCalledTimes(1)
      expect(
        b.ledger.currentView('crew').find((row) => row.issueId === 'issue-1')
          ?.fact.merged,
      ).toBeDefined()
    },
  )

  it('R8 matches the second run after a concurrent merge and continues the rite', async () => {
    const b = bench(2)
    const fakeGh = b.gh.getMockImplementation()!
    b.gh.mockImplementation(async (args, cwd) => {
      if (args[0] !== 'run') return fakeGh(args, cwd)
      const limit = Number(args[args.indexOf('--limit') + 1])
      return JSON.stringify(
        [
          { headSha: MOVED, status: 'completed', conclusion: 'success' },
          { headSha: MERGED, status: 'completed', conclusion: 'success' },
        ].slice(0, limit),
      )
    })
    const result = await b.merge()
    expect(result.acts.map((act) => act.outcome)).toEqual(['merged', 'merged'])
    expect(b.deps.sleep).not.toHaveBeenCalled()
    expect(b.hails.raise).not.toHaveBeenCalled()
    expect(b.events.some((event) => event.startsWith('pr merge 2 '))).toBe(true)
  })

  it.each(['missing row', 'append failure', 'broadcast failure'])(
    'R9 records merged before %s, retains a note, and continues without a hail',
    async (mode) => {
      const b = bench(2)
      let observedOutcome: string | undefined
      if (mode === 'broadcast failure') {
        b.deps.changed.mockImplementation(() => {
          const act = b.service.acts(seat).acts[0]
          if (act?.startedAt) {
            observedOutcome ??= act.outcome
            throw new Error('broadcast unavailable')
          }
        })
      } else {
        vi.spyOn(b.deps.ledger, 'currentView').mockImplementation((id) => {
          observedOutcome ??= b.service.acts(seat).acts[0]?.outcome
          return b.ledger
            .currentView(id)
            .filter(
              (row) => mode !== 'missing row' || row.issueId !== 'issue-1',
            )
        })
        if (mode === 'append failure') {
          vi.spyOn(b.deps.ledger, 'append').mockImplementationOnce(() => {
            throw new Error('ledger unavailable')
          })
        }
      }
      const result = await b.merge()
      expect(observedOutcome).toBe('merged')
      expect(result.acts.map((act) => act.outcome)).toEqual([
        'merged',
        'merged',
      ])
      expect(result.acts[0].error).toContain(
        mode === 'missing row'
          ? 'no ledger row'
          : mode === 'append failure'
            ? 'ledger unavailable'
            : 'broadcast unavailable',
      )
      expect(b.hails.raise).not.toHaveBeenCalled()
      expect(b.events.some((event) => event.startsWith('pr merge 2 '))).toBe(
        true,
      )
    },
  )

  it('R4 failure on #2 stops #3 and hails once; #1 stays merged', async () => {
    const b = bench(3)
    b.gh.mockImplementation(async (args) => {
      if (args[1] === 'merge' && args[2] === '2')
        throw new Error('merge refused')
      if (args[0] === 'run')
        return JSON.stringify([
          { headSha: MERGED, status: 'completed', conclusion: 'success' },
        ])
      return args[1] === 'merge'
        ? ''
        : reading({
            url: `https://github.com/example/repo/pull/${args[2]}`,
            mergeCommit: b.service
              .acts(seat)
              .acts.some(
                (act) =>
                  act.prNumber === Number(args[2]) && act.outcome === 'merged',
              )
              ? { oid: MERGED }
              : null,
          })
    })
    const result = await b.merge()
    expect(result.acts.map((act) => act.outcome)).toEqual([
      'merged',
      'failed',
      'skipped',
    ])
    expect(result.acts[2].error).toBe('stopped after #2')
    expect(
      b.gh.mock.calls.some(([args]) => args[1] === 'merge' && args[2] === '3'),
    ).toBe(false)
    expect(b.hails.raise).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        reason: 'release-failed',
        detail: 'Merge #2 failed: merge refused',
      }),
    )
  })

  it('R5 a second plan cannot start a second rite while a merge is awaiting gh', async () => {
    const b = bench()
    const plan = await b.service.plan(seat)
    let unblock!: () => void
    b.gh.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        unblock = resolve
      })
      return reading()
    })
    const first = b.service.merge({
      ...seat,
      planId: plan.id,
      issueIds: ['issue-1'],
    })
    const second = await b.service.plan(seat)
    await expect(
      b.service.merge({ ...seat, planId: second.id, issueIds: ['issue-1'] }),
    ).rejects.toThrow('a merge is running')
    unblock()
    await first
  })

  it('R5 non-mastermind calls are refused before plan or gh reads', async () => {
    const b = bench()
    await expect(
      b.service.plan({ ...seat, sessionId: 'horse' }),
    ).rejects.toThrow('Only the mastermind')
    await expect(
      b.service.merge({
        ...seat,
        sessionId: 'horse',
        planId: 'forged',
        issueIds: ['issue-1'],
      }),
    ).rejects.toThrow('Only the mastermind')
    expect(b.gh).not.toHaveBeenCalled()
  })

  it('R6 pending precedes every merge-time gh read; running is durable inside a throwing merge', async () => {
    const b = bench()
    const plan = await b.service.plan(seat)
    let observedRunning = false
    b.gh.mockImplementation(async (args) => {
      const act = b.service.acts(seat).acts[0]
      if (args[1] === 'view') {
        expect(act.outcome).toBe('pending')
        return reading()
      }
      expect(act.outcome).toBe('running')
      expect(act.startedAt).not.toBeNull()
      observedRunning = true
      // Capture the durable crash window before the ordinary error handler runs.
      const restarted = new ReleaseActService({
        ...b.deps,
        prs: {
          ...b.deps.prs,
          viewForMerge: async () => ({
            url: 'https://github.com/example/repo/pull/1',
            headSha: HEAD,
            title: 'PR',
            mergeStateStatus: 'CLEAN',
            verify: 'SUCCESS',
            mergeCommit: null,
          }),
          merge: b.deps.prs.merge.bind(b.deps.prs),
          releaseRuns: b.deps.prs.releaseRuns.bind(b.deps.prs),
        },
      })
      expect((await restarted.plan(seat)).candidates[0].verdict).toBe(
        'interrupted — check GitHub',
      )
      throw new Error('process failed')
    })
    await b.service.merge({ ...seat, planId: plan.id, issueIds: ['issue-1'] })
    expect(observedRunning).toBe(true)
    expect(b.service.acts(seat).acts[0].outcome).toBe('failed')
  })

  it('R7 missing gh disables the plan without a hail or act', async () => {
    const b = bench()
    b.gh.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    )
    const plan = await b.service.plan(seat)
    expect(plan.unavailable).toBe(true)
    expect(plan.candidates[0].verdict).toBe('gh not found')
    await expect(
      b.service.merge({ ...seat, planId: plan.id, issueIds: ['issue-1'] }),
    ).rejects.toThrow('Select mergeable')
    expect(b.hails.raise).not.toHaveBeenCalled()
    expect(b.service.acts(seat).acts).toEqual([])
  })
})
