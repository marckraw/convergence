import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { RelayHopRow, SessionRelayRow } from '../database/database.types'
import type { DispatchTerminalReason } from '../session/session.types'
import {
  assertRelayEndpoints,
  isBudgetedOutcome,
  normalizeRelayAction,
  normalizeRelayConditionToken,
  normalizeRelayCrewId,
  normalizeRelayInstruction,
  normalizeRelayOpener,
  normalizeRelaySessionId,
  normalizeRelaySpawnSpec,
} from './relay.pure'
import {
  relayHopFromRow,
  sessionRelayFromRow,
  type CreateSessionRelayInput,
  type RelayHop,
  type RelayHopOutcome,
  type SessionRelay,
  type UpdateSessionRelayInput,
} from './relay.types'

/** What the engine records about one firing. */
export interface AppendRelayHopInput {
  relayId: string
  crewId: string
  flowRunId: string
  sourceSessionId: string
  targetSessionId?: string | null
  spawnedSessionId?: string | null
  triggerStatus: string
  payloadPreview?: string | null
  /** The baton the finishing message handed on, when it declared one. */
  baton?: string | null
  /** Which round of the loop this hop was, when it belonged to one. */
  roundNumber?: number | null
  /**
   * The dispatch id the session layer returned for the input this hop
   * carried (MAR-2759). Absent on rows that delivered nothing.
   */
  dispatchId?: string | null
  outcome: RelayHopOutcome
  error?: string | null
}

/** What a cleared trail leaves behind. */
export interface ClearRelayHopsResult {
  /** Ledger rows deleted. */
  removed: number
  /** Rows left standing because their flow run is still in flight. */
  kept: number
}

/** Where a page of the trail resumes: one row's place in `(fired_at, rowid)`. */
interface RelayHopCursor {
  firedAt: string
  sequence: number
}

/**
 * Repository + use-case boundary for relays and their ledger.
 *
 * Like crews, neither table declares a foreign key: a relay whose source or
 * target session was deleted must survive as a visibly broken wire the user
 * can see and remove, and its hops must stay auditable forever. Reads join
 * against `sessions` only where a live wire is wanted; the ledger never does,
 * because history about a deleted session is the whole point of a ledger.
 */
export class RelayService {
  constructor(private db: Database.Database) {}

  list(): SessionRelay[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM session_relays
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all() as SessionRelayRow[]
    return rows.map(sessionRelayFromRow)
  }

  getById(id: string): SessionRelay | null {
    const row = this.db
      .prepare('SELECT * FROM session_relays WHERE id = ?')
      .get(id) as SessionRelayRow | undefined
    return row ? sessionRelayFromRow(row) : null
  }

  /**
   * Every wire leaving a session, armed or not. The arming decision belongs to
   * the engine, which is the one place that knows what firing means -- a WHERE
   * clause here would be a second, quieter copy of that rule.
   */
  listForSourceSession(sessionId: string): SessionRelay[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM session_relays
         WHERE source_session_id = ?
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(sessionId) as SessionRelayRow[]
    return rows.map(sessionRelayFromRow)
  }

  create(input: CreateSessionRelayInput): SessionRelay {
    const id = randomUUID()
    const crewId = normalizeRelayCrewId(input.crewId)
    const sourceSessionId = normalizeRelaySessionId(
      input.sourceSessionId,
      'source session',
    )
    const action = normalizeRelayAction(input.action)
    const targetSessionId = input.targetSessionId
      ? normalizeRelaySessionId(input.targetSessionId, 'target session')
      : null
    const spawnSpec =
      action === 'spawn' ? normalizeRelaySpawnSpec(input.spawnSpec) : null
    const instruction = normalizeRelayInstruction(input.instruction)
    const conditionToken = normalizeRelayConditionToken(input.conditionToken)
    // Dropped on a spawn the same way a target is: the session a spawn opens
    // has no context to clear, so an opener there would be a first send into a
    // conversation that started one line ago.
    const opener =
      action === 'spawn' ? null : normalizeRelayOpener(input.opener)

    assertRelayEndpoints(sourceSessionId, targetSessionId, action)

    this.db
      .prepare(
        `INSERT INTO session_relays (
           id, crew_id, source_session_id, trigger, action,
           target_session_id, spawn_spec_json, instruction, opener,
           condition_token, armed
         )
         VALUES (?, ?, ?, 'settled', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        crewId,
        sourceSessionId,
        action,
        targetSessionId,
        spawnSpec ? JSON.stringify(spawnSpec) : null,
        instruction,
        opener,
        conditionToken,
        input.armed === false ? 0 : 1,
      )

    return this.requireById(id)
  }

  update(id: string, patch: UpdateSessionRelayInput): SessionRelay {
    const current = this.requireById(id)

    const sourceSessionId =
      patch.sourceSessionId === undefined
        ? current.sourceSessionId
        : normalizeRelaySessionId(patch.sourceSessionId, 'source session')
    const action =
      patch.action === undefined
        ? current.action
        : normalizeRelayAction(patch.action)
    const targetSessionId =
      patch.targetSessionId === undefined
        ? current.targetSessionId
        : patch.targetSessionId
          ? normalizeRelaySessionId(patch.targetSessionId, 'target session')
          : null
    const armed = patch.armed === undefined ? current.armed : patch.armed
    // An untouched instruction survives an edit that was about something else;
    // clearing it is an explicit null, the same shape every other field uses.
    const instruction =
      patch.instruction === undefined
        ? current.instruction
        : normalizeRelayInstruction(patch.instruction)
    // Switching a wire to spawn demands a spec in the same edit: a spawn
    // carrying the previous action's leftovers is not a wire anyone drew.
    const spawnSpec =
      action === 'spawn'
        ? normalizeRelaySpawnSpec(
            patch.spawnSpec === undefined ? current.spawnSpec : patch.spawnSpec,
          )
        : null
    // A hail's target is likewise dropped when the action turns into a spawn.
    const resolvedTarget = action === 'spawn' ? null : targetSessionId
    const opener =
      patch.opener === undefined
        ? current.opener
        : normalizeRelayOpener(patch.opener)
    // Kept across an action switch, unlike the opener and the target: a
    // condition is about WHEN the wire fires, which is the same question
    // whether it hails or spawns.
    const conditionToken =
      patch.conditionToken === undefined
        ? current.conditionToken
        : normalizeRelayConditionToken(patch.conditionToken)
    // And so is its opener: a spawn is born fresh, so it has nothing to open
    // with. Cleared here rather than refused, so switching a wire's action
    // never fails on a field the new action does not have.
    const resolvedOpener = action === 'spawn' ? null : opener

    assertRelayEndpoints(sourceSessionId, resolvedTarget, action)

    this.db
      .prepare(
        `UPDATE session_relays
         SET source_session_id = ?,
             action = ?,
             target_session_id = ?,
             spawn_spec_json = ?,
             instruction = ?,
             opener = ?,
             condition_token = ?,
             armed = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        sourceSessionId,
        action,
        resolvedTarget,
        spawnSpec ? JSON.stringify(spawnSpec) : null,
        instruction,
        resolvedOpener,
        conditionToken,
        armed ? 1 : 0,
        id,
      )

    return this.requireById(id)
  }

  /**
   * Arms or disarms a wire. Separate from `update` because it is the one
   * relay mutation the engine performs on its own -- the budget guard disarms
   * a runaway loop -- and because the UI must never bury it in an edit form.
   */
  setArmed(id: string, armed: boolean): SessionRelay {
    this.requireById(id)
    this.db
      .prepare(
        `UPDATE session_relays
         SET armed = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(armed ? 1 : 0, id)
    return this.requireById(id)
  }

  /**
   * Removes the wire and leaves every hop it ever fired standing. Deleting a
   * relay means "stop doing this", never "pretend it never happened".
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM session_relays WHERE id = ?').run(id)
  }

  appendHop(input: AppendRelayHopInput): RelayHop {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO relay_hops (
           id, relay_id, crew_id, flow_run_id, fired_at, source_session_id,
           target_session_id, spawned_session_id, trigger_status,
           payload_preview, baton, round_number, dispatch_id, outcome, error
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.relayId,
        input.crewId,
        input.flowRunId,
        new Date().toISOString(),
        input.sourceSessionId,
        input.targetSessionId ?? null,
        input.spawnedSessionId ?? null,
        input.triggerStatus,
        input.payloadPreview ?? null,
        input.baton ?? null,
        input.roundNumber ?? null,
        input.dispatchId ?? null,
        input.outcome,
        input.error ?? null,
      )

    return this.requireHopById(id)
  }

  /**
   * Newest first, because a trail is read from the top.
   *
   * `beforeHopId` names the oldest row the caller already holds and asks for
   * what comes after it. The cursor is a hop id rather than an offset because
   * a trail grows at the head while it is being read: paging by offset would
   * show the same row twice the moment a wire fires mid-read. The order is
   * `(fired_at, rowid)` descending -- the clock alone is not total, since a
   * settle fires every wire leaving a session inside the same millisecond, and
   * the ledger's own insertion order is the only tie-break that reads right.
   */
  listHops(
    crewId: string,
    limit = 50,
    beforeHopId?: string | null,
  ): RelayHop[] {
    const anchor = beforeHopId ? this.getHopCursor(beforeHopId) : null
    // The anchor was cleared out from under this read. Answering with the
    // newest page instead would repeat rows the caller is already showing, so
    // the honest answer is "nothing older", and the next full load corrects it.
    if (beforeHopId && !anchor) return []

    const rows = anchor
      ? (this.db
          .prepare(
            `SELECT * FROM relay_hops
             WHERE crew_id = ?
               AND (fired_at < ? OR (fired_at = ? AND rowid < ?))
             ORDER BY fired_at DESC, rowid DESC
             LIMIT ?`,
          )
          .all(
            crewId,
            anchor.firedAt,
            anchor.firedAt,
            anchor.sequence,
            limit,
          ) as RelayHopRow[])
      : (this.db
          .prepare(
            `SELECT * FROM relay_hops
             WHERE crew_id = ?
             ORDER BY fired_at DESC, rowid DESC
             LIMIT ?`,
          )
          .all(crewId, limit) as RelayHopRow[])

    return rows.map(relayHopFromRow)
  }

  /**
   * Forgets one crew's trail.
   *
   * `keepFlowRunIds` names the runs that must survive, and the caller that
   * knows them is the engine: the loop law asks this table whether a wire
   * already spent its turn, so deleting a live run's rows would tell a wire it
   * never fired and let a closed loop re-open. Everything else goes -- a
   * ledger the user cannot empty is a ledger that eventually reads as noise.
   */
  clearHops(
    crewId: string,
    options: { keepFlowRunIds?: readonly string[] } = {},
  ): ClearRelayHopsResult {
    const keep = [...new Set(options.keepFlowRunIds ?? [])]

    const info =
      keep.length === 0
        ? this.db
            .prepare('DELETE FROM relay_hops WHERE crew_id = ?')
            .run(crewId)
        : this.db
            .prepare(
              `DELETE FROM relay_hops
               WHERE crew_id = ?
                 AND flow_run_id NOT IN (${keep.map(() => '?').join(', ')})`,
            )
            .run(crewId, ...keep)

    // Counted after the delete rather than predicted before it: what survived
    // IS what was kept, and one number that cannot disagree with the other.
    const kept = (
      this.db
        .prepare('SELECT COUNT(*) AS count FROM relay_hops WHERE crew_id = ?')
        .get(crewId) as { count: number }
    ).count

    return { removed: info.changes, kept }
  }

  private getHopCursor(hopId: string): RelayHopCursor | null {
    const row = this.db
      .prepare(
        'SELECT fired_at AS firedAt, rowid AS sequence FROM relay_hops WHERE id = ?',
      )
      .get(hopId) as RelayHopCursor | undefined
    return row ?? null
  }

  /**
   * Whether this wire already spent a provider turn in this flow run.
   *
   * The loop law: a wire fires at most once per run, so A -> B -> A ends after
   * two real hops instead of ping-ponging until the budget guard kills it. The
   * ledger is the authority rather than anything held in memory, because it is
   * the one record that survives a restart mid-run.
   *
   * Budgeted outcomes only, and the filtering happens here rather than in SQL
   * so `isBudgetedOutcome` stays the single place that knows which words mean
   * "a turn was spent" -- a WHERE clause listing them would be a second copy
   * free to drift.
   */
  hasFiredInFlowRun(relayId: string, flowRunId: string): boolean {
    const rows = this.db
      .prepare(
        'SELECT outcome FROM relay_hops WHERE relay_id = ? AND flow_run_id = ?',
      )
      .all(relayId, flowRunId) as { outcome: string }[]
    return rows.some((row) => isBudgetedOutcome(row.outcome))
  }

  /**
   * The crews that own at least one wire.
   *
   * A crew with no wires is a label, not a flow, and hailing about one would
   * put a chair in a room that never had a loop in it.
   */
  crewIdsWithRelays(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT crew_id FROM session_relays')
      .all() as { crew_id: string }[]
    return rows.map((row) => row.crew_id)
  }

  /**
   * The crew's trail back to a cutoff, newest first.
   *
   * The stall check's read: its question is per STATION -- which stations
   * still owe delivered work -- so it needs every row a station could be
   * judged by, not the newest one, which a refusal or a healthy sibling can
   * occupy while an older debt stands. Bounded by the live window's cutoff
   * because a loop that last moved beyond it is finished, not stalled.
   */
  listRecentHops(crewId: string, firedSince: string): RelayHop[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM relay_hops
         WHERE crew_id = ? AND fired_at >= ?
         ORDER BY fired_at DESC, rowid DESC`,
      )
      .all(crewId, firedSince) as RelayHopRow[]
    return rows.map(relayHopFromRow)
  }

  /**
   * Hops in this run that actually spent a provider turn, across every crew.
   *
   * The 20-hop backstop's question, and only that one: a chain of distinct
   * wires long enough to outrun the loop law is a runaway however many rooms
   * it passes through.
   */
  countBudgetedHops(flowRunId: string): number {
    const rows = this.db
      .prepare('SELECT outcome FROM relay_hops WHERE flow_run_id = ?')
      .all(flowRunId) as { outcome: string }[]
    return rows.filter((row) => isBudgetedOutcome(row.outcome)).length
  }

  /**
   * Hops this crew spent in this run: the round meter.
   *
   * Per crew because the cap is per crew. One session can belong to two crews,
   * and a run-wide count lets one crew's hops number the other's first row
   * "round 2" and spend a cap that crew never used.
   */
  countBudgetedHopsInCrew(crewId: string, flowRunId: string): number {
    const rows = this.db
      .prepare(
        'SELECT outcome FROM relay_hops WHERE crew_id = ? AND flow_run_id = ?',
      )
      .all(crewId, flowRunId) as { outcome: string }[]
    return rows.filter((row) => isBudgetedOutcome(row.outcome)).length
  }

  /**
   * Records that a station came back, on every hop that was waiting for it.
   *
   * The stall clock's second input. Written from the station's own settle --
   * the same beat that would have continued the loop -- so the fact and the
   * loop can never disagree: if a settle never reaches the engine, no wire
   * would have fired from it either, and the hail is right to stay loud.
   *
   * The stamp is the settle OF THIS HOP'S WORK, not the next settle seen --
   * causal by identity, not inferred from time or counts (MAR-2759): a hop
   * carries the dispatch id the session layer minted for its input, the
   * settle names the ids its turn consumed, and only a named hop is stamped.
   * That answers every corner the old proxies guessed at -- a native
   * follow-up's settle IS its payload's own answer, two payloads queued
   * behind one turn are each stamped only by their own, and an opener's
   * plumbing settle names no payload at all.
   *
   * Rows written before receipts existed carry no id; for exactly those the
   * old reading stays: the first settle after the hop fired stamps, and a
   * settle timestamped at or before the firing (or unreadable) is refused --
   * it cannot be the settle of work that had not been sent yet.
   *
   * Only the first answer is kept. The stamp records the settle that ended
   * this station's silence; a later turn is a different beat and rewriting it
   * would let an ordinary conversation erase the evidence of a failure.
   *
   * Which rows count is `isBudgetedOutcome`, in JavaScript rather than a
   * `WHERE outcome IN (...)`: that list has one owner, and a copy in SQL is a
   * copy free to drift.
   */
  markStationSettled(
    sessionId: string,
    status: string,
    settledAt: string,
    dispatchIds: readonly string[],
  ): number {
    const rows = this.db
      .prepare(
        `SELECT id, outcome, fired_at, dispatch_id FROM relay_hops
         WHERE settled_at IS NULL
           AND COALESCE(spawned_session_id, target_session_id) = ?`,
      )
      .all(sessionId) as {
      id: string
      outcome: string
      fired_at: string
      dispatch_id: string | null
    }[]

    const carried = new Set(dispatchIds)
    const settledMs = Date.parse(settledAt)
    const owed = rows.filter((row) => {
      if (!isBudgetedOutcome(row.outcome)) return false
      // The receipt outranks the clock: whether this settle consumed the
      // hop's input is a fact the session layer stated, not one to re-derive
      // from timestamps.
      if (row.dispatch_id !== null) return carried.has(row.dispatch_id)
      const firedMs = Date.parse(row.fired_at)
      // The pre-receipt floor. Comparable times only: a timestamp this build
      // cannot read is not a proof of anything, so it keeps the old
      // first-answer reading.
      return !(
        Number.isFinite(settledMs) &&
        Number.isFinite(firedMs) &&
        settledMs <= firedMs
      )
    })
    if (owed.length === 0) return 0

    const stamp = this.db.prepare(
      'UPDATE relay_hops SET settled_at = ?, settled_status = ? WHERE id = ?',
    )
    for (const row of owed) {
      stamp.run(settledAt, status, row.id)
    }
    return owed.length
  }

  /**
   * Records that a dispatch ended without a settle (MAR-2759): the user
   * cancelled the queued input, the session holding it was deleted, or the
   * system could not run it.
   *
   * The receipt's other ending, told by the session layer that owns the
   * row, and stamped with the terminal's OWN word (design P): `cancelled`
   * and `abandoned` the stall clock reads as quiet, since nothing is owed
   * for work a station never took; `failed` it reads as loud. Only on hops
   * still unanswered: a settle that already stamped the hop was the truer
   * answer, and a later terminal rewrites nothing. By exact id, never by
   * session, so a sibling receipt queued into the same station stays owed.
   */
  markDispatchesTerminated(
    dispatchIds: readonly string[],
    at: string,
    reason: DispatchTerminalReason,
  ): number {
    if (dispatchIds.length === 0) return 0
    const stamp = this.db.prepare(
      `UPDATE relay_hops SET settled_at = ?, settled_status = ?
       WHERE settled_at IS NULL AND dispatch_id = ?`,
    )
    let stamped = 0
    for (const dispatchId of dispatchIds) {
      stamped += stamp.run(at, reason, dispatchId).changes
    }
    return stamped
  }

  private requireById(id: string): SessionRelay {
    const relay = this.getById(id)
    if (!relay) throw new Error(`Relay not found: ${id}`)
    return relay
  }

  private requireHopById(id: string): RelayHop {
    const row = this.db
      .prepare('SELECT * FROM relay_hops WHERE id = ?')
      .get(id) as RelayHopRow | undefined
    if (!row) throw new Error(`Relay hop not found: ${id}`)
    return relayHopFromRow(row)
  }
}
