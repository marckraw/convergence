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
import { verdictLedgerRecord } from '../work-ledger/work-ledger.pure'

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
    blocked: false,
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
      // MAR-3138 R2: the status never moves in these three, so the flip is
      // the only thing that can write a row -- or fail to.
      // Mutation: leave `blocked` out of `sameObservation` -> the first two
      // cases write nothing, red.
      name: 'blocked goes on -> one row carrying it',
      current: () => [recorded(issue('in-progress'))],
      issues: [issue('in-progress', { blocked: true })],
      rows: [{ state: 'working', blocked: true, lap: 1 }],
    },
    {
      name: 'blocked comes off -> one row saying so',
      current: () => [recorded(issue('in-progress', { blocked: true }))],
      issues: [issue('in-progress')],
      rows: [{ state: 'working', blocked: false }],
    },
    {
      name: 'still blocked -> no row',
      current: () => [recorded(issue('in-progress', { blocked: true }))],
      issues: [issue('in-progress', { blocked: true })],
      rows: [],
    },
    {
      name: 'a blocked issue loses its seat label -> the unassigned row keeps blocked',
      current: () => [recorded(issue('in-progress', { blocked: true }))],
      issues: [],
      rows: [{ state: 'unassigned', seat: null, blocked: true }],
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

  it('MAR-3169 R3: a project the key cannot see is asked about again every tick, and heals to ok', () => {
    const notVisible = trackerHealthAfter({
      previous: null,
      outcome: {
        ok: false,
        refusal: {
          kind: 'project-not-visible',
          message: 'The key cannot see the bound project.',
          retryAt: null,
        },
      },
      now,
    })
    // No backoff: like a refused key, the answer can change the moment the
    // person fixes the binding, and waiting would hide the fix.
    // Mutation: give the state a backoff -> it is not due at once, red.
    expect(notVisible).toEqual({
      state: 'project-not-visible',
      since: now.toISOString(),
      lastOkAt: null,
      backoffUntil: null,
    })
    expect(isTrackerTickDue({ health: notVisible, now })).toBe(true)

    const later = new Date('2026-09-17T08:01:00.000Z')
    const healed = trackerHealthAfter({
      previous: notVisible,
      outcome: { ok: true },
      now: later,
    })
    // `since` restarts at the change, and the change is news for the windows.
    expect(healed).toMatchObject({
      state: 'ok',
      since: later.toISOString(),
      lastOkAt: later.toISOString(),
    })
    expect(trackerHealthChanged(notVisible, healed)).toBe(true)
  })

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

describe('MAR-3085 R4 (lap 2): the hold ends when the tracker moves', () => {
  /**
   * The production sequence, never a hand-set row: the ledger's own rows all
   * the way down, so a row the app cannot actually produce cannot pass.
   */
  function tick(
    current: WorkLedgerRecord[],
    status: string,
    logicalStatus: Parameters<typeof issue>[0],
    seenAt = SEEN,
  ): NewWorkLedgerRecord[] {
    return diffTrackerSnapshot({
      crewId: 'crew-1',
      current,
      issues: [issue(logicalStatus, { status })],
      seenAt,
    })
  }

  const asCurrent = (row: NewWorkLedgerRecord, id: string): WorkLedgerRecord =>
    ({ id, ...row }) as WorkLedgerRecord

  /** What `appendVerdict` writes, built by the ledger's own builder. */
  function ruled(
    previous: WorkLedgerRecord,
    verdict: 'return' | 'pass' | 'stop',
    lap: number,
  ): WorkLedgerRecord {
    return asCurrent(
      verdictLedgerRecord({
        bound: previous,
        verdict,
        lap,
        settleId: 'settle-1',
        note: verdict === 'stop' ? 'the reply' : null,
        seenAt: SEEN,
      }),
      `verdict-${verdict}-${lap}`,
    )
  }

  /** The `returned` row the watcher writes when Linear says In Review. */
  const returnedRow = (lap = 1): WorkLedgerRecord =>
    asCurrent(
      {
        ...(tick([], 'In Review', 'in-review')[0] as NewWorkLedgerRecord),
        lap,
      },
      'row-returned',
    )

  it('A: the whole cycle — RETURN, the tracker catches up, and the next return lands', () => {
    const returned = returnedRow(1)
    expect(returned).toMatchObject({ state: 'returned', verdict: null })

    const verdict = ruled(returned, 'return', 2)
    expect(verdict).toMatchObject({
      state: 'working',
      lap: 2,
      trackerStatus: 'In Review',
    })

    // Still In Review: the tracker has not moved, so the ruling stands alone.
    expect(tick([verdict], 'In Review', 'in-review')).toEqual([])

    // The tracker catches up: ONE confirmation row, no verdict, the new word.
    const confirmed = tick([verdict], 'In Progress', 'in-progress')
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0]).toMatchObject({
      state: 'working',
      lap: 2,
      verdict: null,
      verdictSettleId: null,
      trackerStatus: 'In Progress',
    })
    // Unchanged after that.
    expect(
      tick(
        [asCurrent(confirmed[0]!, 'row-confirm')],
        'In Progress',
        'in-progress',
      ),
    ).toEqual([])

    // Lap 2 comes back: the `returned` row lands, and the loop can rule again.
    // Mutation: restore the `previous.verdict !== null ||` disjunct -> the
    // confirmation row is never written, the hold never clears, and this is
    // red (`expected [] to have a length of 1`).
    const backAgain = tick(
      [asCurrent(confirmed[0]!, 'row-confirm')],
      'In Review',
      'in-review',
    )
    expect(backAgain).toHaveLength(1)
    expect(backAgain[0]).toMatchObject({
      state: 'returned',
      lap: 2,
      verdict: null,
    })
  })

  it('A: a PASS is confirmed once and then quiet', () => {
    const verdict = ruled(returnedRow(1), 'pass', 3)
    expect(tick([verdict], 'In Review', 'in-review')).toEqual([])

    const confirmed = tick([verdict], 'Reviewed', 'reviewed')
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0]).toMatchObject({
      state: 'reviewed',
      lap: 3,
      verdict: null,
      trackerStatus: 'Reviewed',
    })
    expect(
      tick([asCurrent(confirmed[0]!, 'row-confirm')], 'Reviewed', 'reviewed'),
    ).toEqual([])
  })

  it('A: a STOP holds, then takes the tracker’s move without turning the lap over', () => {
    const verdict = ruled(returnedRow(1), 'stop', 4)
    expect(verdict).toMatchObject({
      verdict: 'stop',
      verdictSettleId: 'settle-1',
      verdictNote: 'the reply',
    })
    expect(tick([verdict], 'In Review', 'in-review')).toEqual([])

    const moved = tick([verdict], 'In Progress', 'in-progress')
    expect(moved).toHaveLength(1)
    // A STOP is not a return: the lap does not turn over. And the row the
    // WATCHER writes carries no ruling of its own -- the note and the settle
    // belong to the mastermind's row, not to the tracker's observation.
    // Mutation: carry `verdictNote: previous.verdictNote` -> red here.
    expect(moved[0]).toMatchObject({
      state: 'working',
      lap: 4,
      verdict: null,
      verdictSettleId: null,
      verdictNote: null,
    })
  })

  it('A: a STOP met by Todo is queued again, at the same lap', () => {
    const verdict = ruled(returnedRow(1), 'stop', 4)
    const queued = tick([verdict], 'Todo', 'todo')
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({
      state: 'assigned',
      lap: 4,
      verdict: null,
      verdictNote: null,
    })
  })

  it('A: the mastermind mis-flips — a RETURN row met by Reviewed says so at once', () => {
    const verdict = ruled(returnedRow(1), 'return', 2)
    expect(tick([verdict], 'Reviewed', 'reviewed')[0]).toMatchObject({
      state: 'reviewed',
      verdict: null,
    })
  })

  it('MAR-3138 R2: a blocked returned row is still blocked on its verdict row and after the catch-up', () => {
    const returned = asCurrent(
      {
        ...(diffTrackerSnapshot({
          crewId: 'crew-1',
          current: [],
          issues: [issue('in-review', { status: 'In Review', blocked: true })],
          seenAt: SEEN,
        })[0] as NewWorkLedgerRecord),
      },
      'row-returned-blocked',
    )
    expect(returned).toMatchObject({ state: 'returned', blocked: true })

    // Mutation: write `blocked: false` in `verdictLedgerRecord` -> red here.
    const verdict = ruled(returned, 'return', 2)
    expect(verdict).toMatchObject({ state: 'working', blocked: true })

    // The tracker catches up while the label is still on: the confirmation
    // row carries it too, and nothing else is written after that.
    const confirmed = diffTrackerSnapshot({
      crewId: 'crew-1',
      current: [verdict],
      issues: [issue('in-progress', { status: 'In Progress', blocked: true })],
      seenAt: SEEN,
    })
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0]).toMatchObject({ blocked: true, verdict: null })

    // The decision arrives: one row, at the same lap.
    const decided = diffTrackerSnapshot({
      crewId: 'crew-1',
      current: [asCurrent(confirmed[0]!, 'row-confirm')],
      issues: [issue('in-progress', { status: 'In Progress' })],
      seenAt: '2026-09-17T08:05:00.000Z',
    })
    expect(decided).toHaveLength(1)
    expect(decided[0]).toMatchObject({ blocked: false, lap: 2 })
  })

  it('a stopped row whose label is gone is still unassigned', () => {
    expect(
      diffTrackerSnapshot({
        crewId: 'crew-1',
        current: [ruled(returnedRow(1), 'stop', 3)],
        issues: [],
        seenAt: SEEN,
      })[0],
    ).toMatchObject({ state: 'unassigned', seat: null })
  })
})
