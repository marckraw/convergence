import { describe, expect, it } from 'vitest'
import {
  diffTrackerSnapshot,
  isTrackerTickDue,
  TRACKER_RATE_LIMIT_DEFAULT_BACKOFF_MS,
  trackerHealthAfter,
  trackerHealthChanged,
} from './tracker-watcher.pure'
import type { TrackerIssue, TrackerLogicalStatus } from './tracker.types'
import type {
  NewWorkLedgerRecord,
  WorkLedgerRecord,
} from '../work-ledger/work-ledger.types'

const SEEN = '2026-09-17T08:00:00.000Z'

function issue(
  logicalStatus: TrackerLogicalStatus,
  overrides: Partial<TrackerIssue> = {},
): TrackerIssue {
  return {
    id: 'issue-1',
    identifier: 'EX-1',
    title: 'The work',
    url: 'https://linear.app/example/issue/ex-1',
    status: logicalStatus,
    logicalStatus,
    seat: 'opus',
    wave: null,
    groundedAt: null,
    branchName: null,
    updatedAt: SEEN,
    ...overrides,
  }
}

/** The row a previous tick would have appended for `issue`. */
function recorded(
  from: TrackerIssue,
  overrides: Partial<WorkLedgerRecord> = {},
): WorkLedgerRecord {
  const [row] = diffTrackerSnapshot({
    crewId: 'crew-1',
    current: [],
    issues: [from],
    seenAt: '2026-09-17T07:00:00.000Z',
  })
  return { id: 'row-1', ...(row as NewWorkLedgerRecord), ...overrides }
}

describe('MAR-3084 R5: state comes from the record', () => {
  it.each([
    ['backlog', 'assigned'],
    ['todo', 'assigned'],
    ['in-progress', 'working'],
    ['in-review', 'returned'],
    ['reviewed', 'reviewed'],
    ['done', 'done'],
  ] as const)('a first sighting in %s -> one %s row', (status, state) => {
    const rows = diffTrackerSnapshot({
      crewId: 'crew-1',
      current: [],
      issues: [issue(status)],
      seenAt: SEEN,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ state, seat: 'opus', lap: 1, seenAt: SEEN })
  })

  it.each([
    {
      name: 'label removed -> one unassigned row',
      current: () => [recorded(issue('in-progress'))],
      issues: [] as TrackerIssue[],
      rows: [{ state: 'unassigned', seat: null, issueId: 'issue-1' }],
    },
    {
      name: 'relabel to another seat -> one row with the new seat',
      current: () => [recorded(issue('in-progress'))],
      issues: [issue('in-progress', { seat: 'grok' })],
      rows: [{ state: 'working', seat: 'grok' }],
    },
    {
      // Mutation: append on every tick -> this case has one row, red.
      name: 'unchanged -> no row',
      current: () => [recorded(issue('in-progress'))],
      issues: [issue('in-progress')],
      rows: [],
    },
    {
      name: 'status moves -> one row with the new state',
      current: () => [recorded(issue('in-progress'))],
      issues: [issue('in-review')],
      rows: [{ state: 'returned', lap: 1 }],
    },
    {
      name: 'a returned issue worked again -> the lap turns over',
      current: () => [
        recorded(issue('in-review'), { state: 'returned', lap: 2 }),
      ],
      issues: [issue('in-progress')],
      rows: [{ state: 'working', lap: 3 }],
    },
    {
      name: 'already unassigned and still absent -> no row',
      current: () => [
        recorded(issue('in-progress'), { state: 'unassigned', seat: null }),
      ],
      issues: [],
      rows: [],
    },
  ])('$name', ({ current, issues, rows }) => {
    const appended = diffTrackerSnapshot({
      crewId: 'crew-1',
      current: current(),
      issues,
      seenAt: SEEN,
    })
    expect(appended).toHaveLength(rows.length)
    rows.forEach((row, index) => expect(appended[index]).toMatchObject(row))
    for (const row of appended) expect(row).not.toHaveProperty('id')
  })

  it('lap 2, E: an unmapped status lets a working issue go once, with the tracker’s own word', () => {
    const working = recorded(issue('in-progress'))
    const canceled = issue('other', { status: 'Canceled' })

    // Mutation: skip an unmapped status -> zero rows, red.
    const rows = diffTrackerSnapshot({
      crewId: 'crew-1',
      current: [working],
      issues: [canceled],
      seenAt: SEEN,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      state: 'unassigned',
      trackerStatus: 'Canceled',
      seat: null,
      lap: working.lap,
      seenAt: SEEN,
    })

    // The next tick, still Canceled -> nothing more.
    expect(
      diffTrackerSnapshot({
        crewId: 'crew-1',
        current: [{ id: 'row-2', ...rows[0]! }],
        issues: [canceled],
        seenAt: '2026-09-17T08:01:00.000Z',
      }),
    ).toEqual([])
  })

  it('lap 2, E: an issue let go for an unmapped status comes back as one working row', () => {
    // Fable's integration test. Canceled, then re-opened: the `unassigned` row
    // is not the end of the issue -- the next mapped status appends one row,
    // and the lap it carried is kept (only a return turns a lap over).
    const working = recorded(issue('in-progress'))
    const [letGo] = diffTrackerSnapshot({
      crewId: 'crew-1',
      current: [working],
      issues: [issue('other', { status: 'Canceled' })],
      seenAt: SEEN,
    })

    // Mutation: skip an issue whose current row is `unassigned` -> zero rows.
    const rows = diffTrackerSnapshot({
      crewId: 'crew-1',
      current: [{ id: 'row-2', ...letGo! }],
      issues: [issue('in-progress')],
      seenAt: '2026-09-17T08:05:00.000Z',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      state: 'working',
      seat: 'opus',
      lap: working.lap,
    })
  })

  it.each([
    ['no prior row', () => [] as WorkLedgerRecord[]],
    ['a done row', () => [recorded(issue('done'))]],
  ])(
    'lap 2, E: an unmapped status with %s writes nothing',
    (_case, current) => {
      expect(
        diffTrackerSnapshot({
          crewId: 'crew-1',
          current: current(),
          issues: [issue('other', { status: 'Canceled' })],
          seenAt: SEEN,
        }),
      ).toEqual([])
    },
  )
})

describe('MAR-3084 R7: due and backoff are pure', () => {
  const now = new Date('2026-09-17T08:00:00.000Z')

  it('is due with no health, and after a backoff has passed', () => {
    expect(isTrackerTickDue({ health: null, now })).toBe(true)
    expect(
      isTrackerTickDue({
        health: {
          state: 'rate-limited',
          since: SEEN,
          lastOkAt: null,
          backoffUntil: '2026-09-17T07:59:59.000Z',
        },
        now,
      }),
    ).toBe(true)
  })

  it('is not due inside a rate limit backoff', () => {
    expect(
      isTrackerTickDue({
        health: {
          state: 'rate-limited',
          since: SEEN,
          lastOkAt: null,
          backoffUntil: '2026-09-17T08:00:30.000Z',
        },
        now,
      }),
    ).toBe(false)
  })

  it('lap 2, D: a rate limit with no reset time still backs off, by the default', () => {
    const health = trackerHealthAfter({
      previous: null,
      outcome: {
        ok: false,
        refusal: { kind: 'rate-limited', message: 'x', retryAt: null },
      },
      now,
    })
    // Mutation: a null backoff -> `backoffUntil: null`, red.
    expect(health.backoffUntil).toBe(
      new Date(
        now.getTime() + TRACKER_RATE_LIMIT_DEFAULT_BACKOFF_MS,
      ).toISOString(),
    )
    expect(TRACKER_RATE_LIMIT_DEFAULT_BACKOFF_MS).toBe(5 * 60_000)
  })

  it('lap 2, F: only a new state or a new backoff is news', () => {
    const ok = trackerHealthAfter({
      previous: null,
      outcome: { ok: true },
      now,
    })
    const okAgain = trackerHealthAfter({
      previous: ok,
      outcome: { ok: true },
      now: new Date('2026-09-17T08:01:00.000Z'),
    })
    expect(trackerHealthChanged(null, ok)).toBe(true)
    expect(trackerHealthChanged(ok, okAgain)).toBe(false)
    expect(trackerHealthChanged(ok, { ...okAgain, state: 'unreachable' })).toBe(
      true,
    )
  })

  it('keeps `since` across one outage and remembers the last ok', () => {
    const ok = trackerHealthAfter({
      previous: null,
      outcome: { ok: true },
      now,
    })
    const down = trackerHealthAfter({
      previous: ok,
      outcome: {
        ok: false,
        refusal: { kind: 'unreachable', message: 'x', retryAt: null },
      },
      now: new Date('2026-09-17T08:01:00.000Z'),
    })
    const stillDown = trackerHealthAfter({
      previous: down,
      outcome: {
        ok: false,
        refusal: { kind: 'unreachable', message: 'x', retryAt: null },
      },
      now: new Date('2026-09-17T08:02:00.000Z'),
    })
    expect(stillDown).toEqual({
      state: 'unreachable',
      since: '2026-09-17T08:01:00.000Z',
      lastOkAt: '2026-09-17T08:00:00.000Z',
      backoffUntil: null,
    })
  })
})

describe('MAR-3085 R4: the watcher confirms a verdict, never undoes it', () => {
  /** A verdict row as `appendVerdict` writes it, then read back. */
  function verdictRow(
    verdict: 'return' | 'pass' | 'stop',
    state: WorkLedgerRecord['state'],
    lap: number,
  ): WorkLedgerRecord {
    return {
      ...recorded(issue('in-review')),
      state,
      lap,
      // The status the tracker still reported when the ruling was made.
      trackerStatus: 'In Review',
      verdict,
      verdictSettleId: 'settle-1',
      verdictNote: verdict === 'stop' ? 'the reply' : null,
    }
  }

  const tick = (
    current: WorkLedgerRecord,
    status: string,
    logicalStatus: Parameters<typeof issue>[0],
  ) =>
    diffTrackerSnapshot({
      crewId: 'crew-1',
      current: [current],
      issues: [issue(logicalStatus, { status })],
      seenAt: SEEN,
    })

  it.each([
    [
      'RETURN then the tracker still says In Review',
      'return',
      'working',
      'In Review',
      'in-review',
      0,
      null,
    ],
    [
      'RETURN then In Progress',
      'return',
      'working',
      'In Progress',
      'in-progress',
      0,
      null,
    ],
    [
      'RETURN then Reviewed (mis-flipped)',
      'return',
      'working',
      'Reviewed',
      'reviewed',
      1,
      'reviewed',
    ],
    [
      'PASS then still In Review',
      'pass',
      'reviewed',
      'In Review',
      'in-review',
      0,
      null,
    ],
    ['PASS then Reviewed', 'pass', 'reviewed', 'Reviewed', 'reviewed', 0, null],
    [
      'STOP then still In Review',
      'stop',
      'stopped',
      'In Review',
      'in-review',
      0,
      null,
    ],
    ['STOP then Todo', 'stop', 'stopped', 'Todo', 'todo', 1, 'assigned'],
  ] as const)(
    '%s -> %s row(s)',
    (_case, verdict, state, status, logicalStatus, rows, nextState) => {
      // Mutation: drop the hold -> the "still In Review" cases append a
      // `returned` row over the ruling, red.
      const appended = tick(
        verdictRow(verdict, state, 2),
        status,
        logicalStatus,
      )
      expect(appended).toHaveLength(rows)
      if (nextState) expect(appended[0]).toMatchObject({ state: nextState })
    },
  )

  it('does not turn the lap over again when the tracker confirms a RETURN', () => {
    expect(
      tick(verdictRow('return', 'working', 2), 'In Progress', 'in-progress'),
    ).toEqual([])
    // And a genuine new return after the verdict lap still turns over.
    expect(
      tick(
        {
          ...verdictRow('return', 'working', 2),
          verdict: null,
          trackerStatus: 'In Progress',
        },
        'In Review',
        'in-review',
      )[0],
    ).toMatchObject({ state: 'returned', lap: 2 })
  })

  it('a stopped row whose label is gone is still unassigned', () => {
    expect(
      diffTrackerSnapshot({
        crewId: 'crew-1',
        current: [verdictRow('stop', 'stopped', 3)],
        issues: [],
        seenAt: SEEN,
      })[0],
    ).toMatchObject({ state: 'unassigned', seat: null })
  })
})
