import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { RelayHopRow, SessionRelayRow } from '../database/database.types'
import {
  assertRelayEndpoints,
  isBudgetedOutcome,
  normalizeRelayAction,
  normalizeRelayCrewId,
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
  outcome: RelayHopOutcome
  error?: string | null
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

    assertRelayEndpoints(sourceSessionId, targetSessionId, action)

    this.db
      .prepare(
        `INSERT INTO session_relays (
           id, crew_id, source_session_id, trigger, action,
           target_session_id, spawn_spec_json, armed
         )
         VALUES (?, ?, ?, 'settled', ?, ?, ?, ?)`,
      )
      .run(
        id,
        crewId,
        sourceSessionId,
        action,
        targetSessionId,
        spawnSpec ? JSON.stringify(spawnSpec) : null,
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

    assertRelayEndpoints(sourceSessionId, resolvedTarget, action)

    this.db
      .prepare(
        `UPDATE session_relays
         SET source_session_id = ?,
             action = ?,
             target_session_id = ?,
             spawn_spec_json = ?,
             armed = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        sourceSessionId,
        action,
        resolvedTarget,
        spawnSpec ? JSON.stringify(spawnSpec) : null,
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
           payload_preview, outcome, error
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.outcome,
        input.error ?? null,
      )

    return this.requireHopById(id)
  }

  /** Newest first, because a trail is read from the top. */
  listHops(crewId: string, limit = 50): RelayHop[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM relay_hops
         WHERE crew_id = ?
         ORDER BY fired_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(crewId, limit) as RelayHopRow[]
    return rows.map(relayHopFromRow)
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

  /** Hops in this run that actually spent a provider turn. */
  countBudgetedHops(flowRunId: string): number {
    const rows = this.db
      .prepare('SELECT outcome FROM relay_hops WHERE flow_run_id = ?')
      .all(flowRunId) as { outcome: string }[]
    return rows.filter((row) => isBudgetedOutcome(row.outcome)).length
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
