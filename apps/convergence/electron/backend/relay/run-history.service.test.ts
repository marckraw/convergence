import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { CrewHailService } from './crew-hail.service'
import { RelayService } from './relay.service'
import {
  DEFAULT_RUN_HISTORY_LIMIT,
  MAX_RUN_HISTORY_LIMIT,
  RunHistoryService,
} from './run-history.service'
import type { CrewHailReason } from './crew-hail.types'
import type { RelayHopOutcome } from './relay.types'

describe('RunHistoryService', () => {
  let db: Database.Database
  let relays: RelayService
  let hails: CrewHailService
  let history: RunHistoryService

  beforeEach(() => {
    db = getDatabase()
    relays = new RelayService(db)
    hails = new CrewHailService(db)
    history = new RunHistoryService(db)

    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    for (const id of ['s1', 's2', 's3']) {
      db.prepare(
        `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
         VALUES (?, 'p1', 'codex', ?, '/tmp/p1')`,
      ).run(id, id)
    }
    for (const id of ['c1', 'c2']) {
      db.prepare('INSERT INTO session_crews (id, name) VALUES (?, ?)').run(
        id,
        id,
      )
    }
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  function wire(source = 's1', target = 's2', crewId = 'c1') {
    return relays.create({
      crewId,
      sourceSessionId: source,
      action: 'hail',
      targetSessionId: target,
    })
  }

  /** One ledger row, with its clock stated so the order under test is real. */
  function hop(input: {
    relayId: string
    flowRunId: string
    firedAt: string
    crewId?: string
    outcome?: RelayHopOutcome
    lapNumber?: number | null
    settledAt?: string | null
  }): string {
    const row = relays.appendHop({
      relayId: input.relayId,
      crewId: input.crewId ?? 'c1',
      flowRunId: input.flowRunId,
      sourceSessionId: 's1',
      targetSessionId: 's2',
      triggerStatus: 'completed',
      outcome: input.outcome ?? 'delivered',
      lapNumber: input.lapNumber === undefined ? 1 : input.lapNumber,
    })
    db.prepare(
      'UPDATE relay_hops SET fired_at = ?, settled_at = ? WHERE id = ?',
    ).run(
      input.firedAt,
      input.settledAt === undefined
        ? '2099-01-01T00:00:00.000Z'
        : input.settledAt,
      row.id,
    )
    return row.id
  }

  function raise(input: {
    reason: CrewHailReason
    flowRunId: string | null
    raisedAt: string
    crewId?: string
    sessionId?: string
  }): string {
    const row = hails.raise({
      crewId: input.crewId ?? 'c1',
      flowRunId: input.flowRunId,
      reason: input.reason,
      sessionId: input.sessionId ?? 's1',
      detail: 'because',
    })
    if (!row) throw new Error('the hail book refused a fixture')
    db.prepare('UPDATE crew_hails SET raised_at = ? WHERE id = ?').run(
      input.raisedAt,
      row.id,
    )
    return row.id
  }

  /**
   * THE grouping canary (R12). A run is one `flowRunId`; a call with no run id
   * belongs to none, because a station whose baton nothing answered may have
   * no outgoing wire at all.
   *
   * Mutation that reds it: attach the unattributed hail to the newest run in
   * `assembleRuns` (drop the `flowRunId === null` skip) -- the orphan lands in
   * a chain that was fine, and the newest run's status flips to needs-you.
   */
  it('groups by run, newest first, and keeps a call with no run out of them', () => {
    const a = wire('s1', 's2')
    const b = wire('s2', 's3')
    hop({
      relayId: a.id,
      flowRunId: 'run-old',
      firedAt: '2026-09-05T10:00:00.000Z',
    })
    hop({
      relayId: a.id,
      flowRunId: 'run-new',
      firedAt: '2026-09-06T10:00:00.000Z',
    })
    hop({
      relayId: b.id,
      flowRunId: 'run-new',
      firedAt: '2026-09-06T10:01:00.000Z',
    })
    raise({
      reason: 'terminal',
      flowRunId: 'run-new',
      raisedAt: '2026-09-06T10:02:00.000Z',
    })
    raise({
      reason: 'unrouted',
      flowRunId: null,
      raisedAt: '2026-09-06T11:00:00.000Z',
    })

    const page = history.listRuns('c1')

    expect(page.runs.map((run) => run.flowRunId)).toEqual([
      'run-new',
      'run-old',
    ])
    expect(page.runs[0].counts.events).toBe(3)
    expect(page.runs[0].status).toEqual({ word: 'handed-back', reason: null })
    expect(page.unattributedHails).toHaveLength(1)
    expect(page.unattributedHails[0].flowRunId).toBeNull()
    // No run swallowed it.
    for (const run of page.runs) {
      expect(run.hails.every((hail) => hail.flowRunId === run.flowRunId)).toBe(
        true,
      )
    }
    expect(page.hasMore).toBe(false)
  })

  it('orders a run’s events by when they happened, oldest first', () => {
    const a = wire('s1', 's2')
    // Inserted out of order on purpose: the ledger's insertion order is not
    // the run's order, and history reads the clock.
    hop({
      relayId: a.id,
      flowRunId: 'r',
      firedAt: '2026-09-06T10:02:00.000Z',
      lapNumber: 2,
    })
    hop({
      relayId: a.id,
      flowRunId: 'r',
      firedAt: '2026-09-06T10:00:00.000Z',
      lapNumber: 1,
    })

    const [run] = history.listRuns('c1').runs

    expect(run.laps.map((lap) => lap.lap)).toEqual([1, 2])
    expect(run.laps[0].hops[0].firedAt).toBe('2026-09-06T10:00:00.000Z')
    expect(run.startedAt).toBe('2026-09-06T10:00:00.000Z')
    expect(run.endedAt).toBe('2026-09-06T10:02:00.000Z')
  })

  /**
   * The lap the ledger never stored is derived, not defaulted. Same rule as
   * the pure canary, proved through the real query so the ordering the rule
   * depends on is the one SQL actually returns.
   *
   * Mutation that reds it: return 1 for a null `lapNumber` in `readLapNumber`.
   */
  it('groups a run recorded before laps existed into the same laps', () => {
    const a = wire('s1', 's2')
    const b = wire('s2', 's3')
    let minute = 0
    for (let lap = 1; lap <= 3; lap += 1) {
      for (const relay of [a, b]) {
        hop({
          relayId: relay.id,
          flowRunId: 'legacy',
          firedAt: `2026-09-06T10:${String(minute).padStart(2, '0')}:00.000Z`,
          lapNumber: null,
        })
        minute += 1
      }
    }

    const [run] = history.listRuns('c1').runs

    expect(run.laps.map((lap) => lap.lap)).toEqual([1, 2, 3])
    expect(run.laps.map((lap) => lap.hops.length)).toEqual([2, 2, 2])
    expect(run.counts.laps).toBe(3)
  })

  it('builds a run out of a call with no hop behind it', () => {
    raise({
      reason: 'unrouted',
      flowRunId: 'lonely',
      raisedAt: '2026-09-06T10:00:00.000Z',
    })

    const page = history.listRuns('c1')

    expect(page.runs).toHaveLength(1)
    expect(page.runs[0]).toMatchObject({
      flowRunId: 'lonely',
      startedAt: '2026-09-06T10:00:00.000Z',
      status: { word: 'needs-you', reason: 'parked' },
    })
  })

  it('answers about one crew only', () => {
    const mine = wire('s1', 's2', 'c1')
    const theirs = wire('s1', 's2', 'c2')
    hop({
      relayId: mine.id,
      flowRunId: 'r1',
      firedAt: '2026-09-06T10:00:00.000Z',
    })
    hop({
      relayId: theirs.id,
      crewId: 'c2',
      flowRunId: 'r2',
      firedAt: '2026-09-06T10:01:00.000Z',
    })
    raise({
      reason: 'stall',
      flowRunId: null,
      raisedAt: '2026-09-06T10:02:00.000Z',
      crewId: 'c2',
    })

    expect(history.listRuns('c1').runs.map((run) => run.flowRunId)).toEqual([
      'r1',
    ])
    expect(history.listRuns('c1').unattributedHails).toEqual([])
    expect(history.listRuns('c2').runs.map((run) => run.flowRunId)).toEqual([
      'r2',
    ])
  })

  describe('paging', () => {
    function seed(count: number) {
      const a = wire('s1', 's2')
      for (let index = 0; index < count; index += 1) {
        hop({
          relayId: a.id,
          flowRunId: `run-${String(index).padStart(2, '0')}`,
          firedAt: `2026-09-06T10:${String(index).padStart(2, '0')}:00.000Z`,
        })
      }
    }

    it('says there is more only when there was another row', () => {
      seed(3)

      const page = history.listRuns('c1', { limit: 2 })
      expect(page.runs.map((run) => run.flowRunId)).toEqual([
        'run-02',
        'run-01',
      ])
      expect(page.hasMore).toBe(true)

      const rest = history.listRuns('c1', { limit: 2, before: 'run-01' })
      expect(rest.runs.map((run) => run.flowRunId)).toEqual(['run-00'])
      expect(rest.hasMore).toBe(false)
    })

    /**
     * Calls with no run belong to no page, so they ride the first one only.
     * Repeating them under every page would make one dropped call look like
     * several.
     */
    it('returns the unattributed calls on the first page only', () => {
      seed(3)
      raise({
        reason: 'unrouted',
        flowRunId: null,
        raisedAt: '2026-09-06T11:00:00.000Z',
      })

      expect(
        history.listRuns('c1', { limit: 2 }).unattributedHails,
      ).toHaveLength(1)
      expect(
        history.listRuns('c1', { limit: 2, before: 'run-01' })
          .unattributedHails,
      ).toEqual([])
    })

    /**
     * The anchor was cleared out from under the read. Answering with the
     * newest page would repeat runs the caller is already showing.
     */
    it('answers "nothing older" when the cursor no longer exists', () => {
      seed(2)

      expect(
        history.listRuns('c1', { before: 'a-run-that-was-cleared' }),
      ).toEqual({
        runs: [],
        unattributedHails: [],
        outcomes: {},
        hasMore: false,
      })
    })

    it('falls back to the default page size rather than to everything', () => {
      seed(DEFAULT_RUN_HISTORY_LIMIT + 2)

      expect(history.listRuns('c1', { limit: 0 }).runs).toHaveLength(
        DEFAULT_RUN_HISTORY_LIMIT,
      )
      expect(history.listRuns('c1', { limit: 2.5 }).runs).toHaveLength(
        DEFAULT_RUN_HISTORY_LIMIT,
      )
      expect(
        history.listRuns('c1', { limit: MAX_RUN_HISTORY_LIMIT + 500 }).runs
          .length,
      ).toBeLessThanOrEqual(MAX_RUN_HISTORY_LIMIT)
    })
  })

  it('says running while a delivery is still owed, and reads the ledger for it', () => {
    const a = wire('s1', 's2')
    hop({
      relayId: a.id,
      flowRunId: 'live',
      firedAt: '2026-09-06T10:00:00.000Z',
      settledAt: null,
    })

    expect(history.listRuns('c1').runs[0].status).toEqual({
      word: 'running',
      reason: null,
    })
  })
})
