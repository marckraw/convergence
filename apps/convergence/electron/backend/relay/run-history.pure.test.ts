import { describe, expect, it } from 'vitest'
import { readLapNumber } from './relay.pure'
import {
  assembleRuns,
  deriveRunStatus,
  normalizeHailReason,
  normalizeHistoryOutcome,
  normalizeHopOutcome,
} from './run-history.pure'
import type { CrewHail } from './crew-hail.types'
import type { RelayHop } from './relay.types'

function hop(overrides: Partial<RelayHop> & { id: string }): RelayHop {
  return {
    relayId: 'wire-a',
    crewId: 'c1',
    flowRunId: 'run-1',
    firedAt: '2026-09-06T12:00:00.000Z',
    sourceSessionId: 's1',
    targetSessionId: 's2',
    spawnedSessionId: null,
    triggerStatus: 'completed',
    payloadPreview: null,
    baton: null,
    roundNumber: 1,
    lapNumber: 1,
    settledAt: '2026-09-06T12:01:00.000Z',
    settledStatus: 'completed',
    dispatchId: 'receipt-1',
    outcome: 'delivered',
    error: null,
    ...overrides,
  }
}

function hail(overrides: Partial<CrewHail> & { id: string }): CrewHail {
  return {
    crewId: 'c1',
    flowRunId: 'run-1',
    reason: 'terminal',
    sessionId: 's1',
    baton: 'marcin',
    message: null,
    detail: 'Handed to you.',
    hopId: null,
    raisedAt: '2026-09-06T12:05:00.000Z',
    acknowledgedAt: null,
    ...overrides,
  }
}

describe('normalizeHopOutcome', () => {
  it('speaks the design vocabulary, not the engine’s', () => {
    expect(normalizeHopOutcome('delivered')).toBe('delivered')
    expect(normalizeHopOutcome('queued')).toBe('queued')
    expect(normalizeHopOutcome('spawned')).toBe('delivered')
    expect(normalizeHopOutcome('skipped-baton')).toBe('held')
    expect(normalizeHopOutcome('skipped-muted')).toBe('held')
    expect(normalizeHopOutcome('skipped-failed')).toBe('held')
    expect(normalizeHopOutcome('skipped-round-budget')).toBe('limit-reached')
    expect(normalizeHopOutcome('skipped-budget')).toBe('limit-reached')
    expect(normalizeHopOutcome('error')).toBe('delivery-failed')
  })

  /**
   * The vocabulary law at the history boundary: a row written by an older or
   * newer build must land somewhere neutral rather than render blank.
   */
  it('keeps a retired word readable and an unknown one neutral', () => {
    expect(normalizeHopOutcome('skipped-already-fired')).toBe('loop-closed')
    expect(normalizeHopOutcome('skipped-disarmed')).toBe('unknown')
    expect(normalizeHopOutcome('')).toBe('unknown')
  })
})

describe('normalizeHailReason', () => {
  it('keeps the four ways a run needs him apart from the one that worked', () => {
    expect(normalizeHailReason('terminal')).toBe('handed-back')
    expect(normalizeHailReason('unrouted')).toBe('parked')
    expect(normalizeHailReason('round-budget')).toBe('limit-reached')
    expect(normalizeHailReason('budget')).toBe('limit-reached')
    expect(normalizeHailReason('delivery-failed')).toBe('delivery-failed')
    expect(normalizeHailReason('stall')).toBe('reply-overdue')
  })

  it('keeps the retired reason readable and an unknown one neutral', () => {
    expect(normalizeHailReason('loop-closed')).toBe('loop-closed')
    expect(normalizeHailReason('something-newer')).toBe('unknown')
  })
})

describe('normalizeHistoryOutcome', () => {
  it('reads either kind of record, which is what one event list holds', () => {
    expect(normalizeHistoryOutcome({ kind: 'hop', outcome: 'queued' })).toBe(
      'queued',
    )
    expect(normalizeHistoryOutcome({ kind: 'hail', reason: 'stall' })).toBe(
      'reply-overdue',
    )
  })
})

describe('deriveRunStatus', () => {
  /** Inside the live window of every hop the helpers above build. */
  const now = new Date('2026-09-06T12:10:00.000Z')

  it('says handed back when a station gave the work to the chair', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [hop({ id: 'h1' })],
        hails: [hail({ id: 'x1', reason: 'terminal' })],
      }),
    ).toEqual({ word: 'handed-back', reason: null })
  })

  /**
   * THE promise of R3 and of design promise 5: a failure, a stall or an
   * exhausted budget must never masquerade as a successful terminal handoff.
   *
   * Mutation that reds it: map `delivery-failed` to `handed-back` in the
   * hail switch, or answer `handedBack` before the needs-you loop.
   */
  it('never lets a failure, a limit, a park or a stall read as handed back', () => {
    const cases: Array<[string, string]> = [
      ['delivery-failed', 'failed'],
      ['round-budget', 'limit'],
      ['budget', 'limit'],
      ['unrouted', 'parked'],
      ['stall', 'stalled'],
    ]
    for (const [reason, expected] of cases) {
      expect(
        deriveRunStatus({ now, hops: [], hails: [hail({ id: 'x', reason })] }),
      ).toEqual({ word: 'needs-you', reason: expected })
      // And the same run reaching the chair as well does not paint over it.
      expect(
        deriveRunStatus({
          now,
          hops: [],
          hails: [
            hail({ id: 'x', reason }),
            hail({ id: 'y', reason: 'terminal' }),
          ],
        }),
      ).toEqual({ word: 'needs-you', reason: expected })
    }
  })

  it('leads with the ending least likely to resolve itself', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [],
        hails: [
          hail({ id: 'x', reason: 'stall' }),
          hail({ id: 'y', reason: 'delivery-failed' }),
        ],
      }),
    ).toEqual({ word: 'needs-you', reason: 'failed' })
  })

  /**
   * Acknowledgement is not read here. Marking a call seen acknowledges it; it
   * does not un-fail a delivery, and a status that changed when he looked at
   * it would be a record of his attention rather than of the run.
   */
  it('does not change when the call has been marked seen', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [],
        hails: [
          hail({
            id: 'x',
            reason: 'delivery-failed',
            acknowledgedAt: '2026-09-06T13:00:00.000Z',
          }),
        ],
      }),
    ).toEqual({ word: 'needs-you', reason: 'failed' })
  })

  /**
   * Asked of the LEDGER, not of the engine's memory: a budgeted hop with no
   * settle stamp is work a station still owes, and that fact survives the
   * restart that empties every baton.
   */
  it('says running while a delivered hop is still owed', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [hop({ id: 'h1', settledAt: null })],
        hails: [],
      }),
    ).toEqual({ word: 'running', reason: null })
  })

  it('does not call a refusal outstanding work', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [hop({ id: 'h1', outcome: 'skipped-baton', settledAt: null })],
        hails: [],
      }),
    ).toEqual({ word: 'finished-quiet', reason: null })
  })

  it('says finished quiet when every delivery came back and nobody asked', () => {
    expect(
      deriveRunStatus({ now, hops: [hop({ id: 'h1' })], hails: [] }),
    ).toEqual({
      word: 'finished-quiet',
      reason: null,
    })
  })

  it('says unknown for a run recorded entirely in another build’s words', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [hop({ id: 'h1', outcome: 'skipped-disarmed' })],
        hails: [hail({ id: 'x', reason: 'something-newer' })],
      }),
    ).toEqual({ word: 'unknown', reason: null })
    expect(deriveRunStatus({ now, hops: [], hails: [] })).toEqual({
      word: 'unknown',
      reason: null,
    })
  })

  /**
   * H1. The hop rows are FACTS about the run, and a run whose delivery broke
   * needs him whether or not a call was ever filed for it -- which no
   * pre-RUN45 row could have been, since `delivery-failed` did not exist. The
   * old reading looked at the hails alone, so those runs read "finished
   * quiet", and one that also reached the chair read "handed back": exactly
   * the masquerade promise 5 forbids.
   *
   * Mutation that reds it: drop the hop switch and read `input.hails` alone.
   */
  it('reads a failure and a spent limit off the hops, with no call filed', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [hop({ id: 'h1', outcome: 'error', settledAt: null })],
        hails: [],
      }),
    ).toEqual({ word: 'needs-you', reason: 'failed' })

    expect(
      deriveRunStatus({
        now,
        hops: [hop({ id: 'h1', outcome: 'error', settledAt: null })],
        hails: [hail({ id: 'x', reason: 'terminal' })],
      }),
    ).toEqual({ word: 'needs-you', reason: 'failed' })

    for (const outcome of ['skipped-budget', 'skipped-round-budget']) {
      expect(
        deriveRunStatus({
          now,
          hops: [hop({ id: 'h1', outcome, settledAt: null })],
          hails: [hail({ id: 'x', reason: 'terminal' })],
        }),
      ).toEqual({ word: 'needs-you', reason: 'limit' })
    }
  })

  /**
   * L1. A turn that ends without an assistant message owed nothing, so
   * nothing failed: the row is a hold, and a run of them is a quiet run.
   *
   * Mutation that reds it: map `skipped-no-message` to `delivery-failed`.
   */
  it('does not call a turn with no message to carry a failure', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [
          hop({ id: 'h1', outcome: 'skipped-no-message', settledAt: null }),
        ],
        hails: [],
      }),
    ).toEqual({ word: 'finished-quiet', reason: null })
  })

  /**
   * M1, half one: a hop with no receipt can never be stamped by name, so
   * "still owed" is not something the ledger can say about it. Reading it as
   * owed left every pre-receipt row running forever, and no filter could move
   * it.
   *
   * Mutation that reds it: treat every unsettled budgeted hop as owed.
   */
  it('does not call an unreceipted delivery outstanding work', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [hop({ id: 'h1', settledAt: null, dispatchId: null })],
        hails: [],
      }),
    ).toEqual({ word: 'unknown', reason: null })
  })

  /**
   * M1, half two: the stall clock's own rule, applied to the status. Outside
   * the live window a loop is finished rather than stalled -- so a hop still
   * unsettled out there is not work in flight, it is an ending nobody
   * recorded.
   *
   * Mutation that reds it: drop the window check from `isStillOwed`.
   */
  it('stops calling a run running once its owed hop is older than the live window', () => {
    const hops = [hop({ id: 'h1', settledAt: null })]
    expect(deriveRunStatus({ now, hops, hails: [] })).toEqual({
      word: 'running',
      reason: null,
    })
    expect(
      deriveRunStatus({
        now: new Date('2026-09-06T13:30:00.000Z'),
        hops,
        hails: [],
      }),
    ).toEqual({ word: 'unknown', reason: null })
  })

  /** A run still owing work that ALSO failed elsewhere leads with the failure. */
  it('keeps a failure ahead of work still owed', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [
          hop({ id: 'h1', settledAt: null }),
          hop({ id: 'h2', outcome: 'error', settledAt: null }),
        ],
        hails: [],
      }),
    ).toEqual({ word: 'needs-you', reason: 'failed' })
  })

  it('reads a legacy loop-closed call as the parked run it was', () => {
    expect(
      deriveRunStatus({
        now,
        hops: [],
        hails: [hail({ id: 'x', reason: 'loop-closed' })],
      }),
    ).toEqual({ word: 'needs-you', reason: 'parked' })
  })
})

describe('readLapNumber', () => {
  const ring = ['wire-a', 'wire-b', 'wire-c']

  /** Three laps of a three-wire ring, written by a build that stored laps. */
  function storedLedger(): RelayHop[] {
    const rows: RelayHop[] = []
    for (let lap = 1; lap <= 3; lap += 1) {
      for (const relayId of ring) {
        rows.push(
          hop({
            id: `${relayId}-${lap}`,
            relayId,
            lapNumber: lap,
            firedAt: `2026-09-06T12:0${rows.length}:00.000Z`,
          }),
        )
      }
    }
    return rows
  }

  /**
   * THE legacy canary. Rows written before the column existed carry null, and
   * null is DERIVED rather than defaulted -- otherwise every old multi-pass
   * run flattens into a single lap and history lies about what happened.
   *
   * Mutation that reds it: return 1 for a null `lapNumber` in `readLapNumber`.
   */
  it('derives the same laps for legacy rows as a new build stored', () => {
    const stored = storedLedger()
    const legacy = stored.map((row) => ({ ...row, lapNumber: null }))

    expect(stored.map((row) => readLapNumber(row, stored))).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3, 3,
    ])
    expect(legacy.map((row) => readLapNumber(row, legacy))).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3, 3,
    ])
  })

  it('counts only this wire, this run, and only turns actually spent', () => {
    const ledger = [
      hop({ id: 'a1', relayId: 'wire-a', lapNumber: null }),
      // Another wire, and a refusal: neither pushes wire-a forward.
      hop({ id: 'b1', relayId: 'wire-b', lapNumber: null }),
      hop({
        id: 'a-held',
        relayId: 'wire-a',
        outcome: 'skipped-baton',
        lapNumber: null,
      }),
      // Another run entirely.
      hop({
        id: 'other',
        relayId: 'wire-a',
        flowRunId: 'run-2',
        lapNumber: null,
      }),
      hop({ id: 'a2', relayId: 'wire-a', lapNumber: null }),
    ]

    expect(readLapNumber(ledger[4], ledger)).toBe(2)
    expect(readLapNumber(ledger[3], ledger)).toBe(1)
  })

  it('trusts a stored lap even when the ledger it is read against is partial', () => {
    const row = hop({ id: 'a3', lapNumber: 7 })

    expect(readLapNumber(row, [])).toBe(7)
  })
})

describe('assembleRuns', () => {
  it('groups by run, orders laps, and keeps a call with no run out of them', () => {
    const hops = [
      hop({ id: 'h1', flowRunId: 'run-1', relayId: 'wire-a', lapNumber: 1 }),
      hop({ id: 'h2', flowRunId: 'run-1', relayId: 'wire-a', lapNumber: 2 }),
      hop({ id: 'h3', flowRunId: 'run-2', relayId: 'wire-a', lapNumber: 1 }),
    ]
    const hails = [hail({ id: 'x1', flowRunId: 'run-1', reason: 'terminal' })]
    const orphan = hail({ id: 'x2', flowRunId: null, reason: 'unrouted' })

    const page = assembleRuns({
      crewId: 'c1',
      hops,
      // The orphan goes IN with the rest: whether it belongs to a run is this
      // function's decision, and a test that pre-filtered it would prove
      // nothing about the rule.
      hails: [...hails, orphan],
      flowRunIds: ['run-2', 'run-1'],
      hasMore: false,
      now: new Date('2026-09-06T12:10:00.000Z'),
    })

    expect(page.runs.map((run) => run.flowRunId)).toEqual(['run-2', 'run-1'])
    const first = page.runs[1]
    expect(first.laps.map((lap) => lap.lap)).toEqual([1, 2])
    expect(first.counts).toEqual({
      deliveries: 2,
      failures: 0,
      laps: 2,
      events: 3,
    })
    expect(first.status).toEqual({ word: 'handed-back', reason: null })
    // The orphan belongs to no run: attaching it to the newest would blame a
    // chain that was fine, and its `unrouted` reason would flip that run's
    // status from handed back to needs-you (parked).
    expect(page.unattributedHails.map((h) => h.id)).toEqual(['x2'])
    for (const run of page.runs) {
      expect(run.hails.every((h) => h.flowRunId === run.flowRunId)).toBe(true)
    }
    expect(page.runs[0].status).toEqual({
      word: 'finished-quiet',
      reason: null,
    })
    expect(page.runs[0].counts.events).toBe(1)
  })

  it('builds a run that is only a call, because a parked station has no hop', () => {
    const orphanRunHail = hail({
      id: 'x1',
      flowRunId: 'run-9',
      reason: 'unrouted',
    })

    const page = assembleRuns({
      crewId: 'c1',
      hops: [],
      hails: [orphanRunHail],
      flowRunIds: ['run-9'],
      hasMore: false,
      now: new Date('2026-09-06T12:10:00.000Z'),
    })

    expect(page.runs).toHaveLength(1)
    expect(page.runs[0].laps).toEqual([])
    expect(page.runs[0].status).toEqual({ word: 'needs-you', reason: 'parked' })
    expect(page.runs[0].startedAt).toBe(orphanRunHail.raisedAt)
  })

  it('counts failures and spans the run from its first event to its last', () => {
    const page = assembleRuns({
      crewId: 'c1',
      hops: [
        hop({ id: 'h1', firedAt: '2026-09-06T12:00:00.000Z' }),
        hop({
          id: 'h2',
          outcome: 'error',
          firedAt: '2026-09-06T12:02:00.000Z',
          lapNumber: 2,
        }),
      ],
      hails: [
        hail({
          id: 'x1',
          reason: 'delivery-failed',
          raisedAt: '2026-09-06T12:03:00.000Z',
        }),
      ],
      flowRunIds: ['run-1'],
      hasMore: true,
      now: new Date('2026-09-06T12:10:00.000Z'),
    })

    const run = page.runs[0]
    expect(run.counts.failures).toBe(1)
    expect(run.counts.deliveries).toBe(1)
    expect(run.startedAt).toBe('2026-09-06T12:00:00.000Z')
    expect(run.endedAt).toBe('2026-09-06T12:03:00.000Z')
    expect(run.status).toEqual({ word: 'needs-you', reason: 'failed' })
    expect(page.hasMore).toBe(true)
  })
})
