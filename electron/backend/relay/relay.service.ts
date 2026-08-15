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
   * The wires a settled session should be measured against: armed or not, so
   * the engine can record a disarmed skip rather than stay silent about it.
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
   * The flow run a settling session belongs to: the run of the newest hop that
   * delivered into it, or a brand new run when nothing relayed into it.
   *
   * This is deliberately the simplest ancestry that closes the loop. Its known
   * imprecision: a session that was relayed into once and is later driven by
   * hand still inherits that old run, so its budget can trip earlier than a
   * fresh conversation's would. That errs toward disarming, which is the safe
   * direction, and re-arming is one click.
   */
  resolveFlowRunId(sessionId: string): string {
    const row = this.db
      .prepare(
        `SELECT flow_run_id FROM relay_hops
         WHERE target_session_id = ? OR spawned_session_id = ?
         ORDER BY fired_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(sessionId, sessionId) as { flow_run_id: string } | undefined

    return row?.flow_run_id ?? randomUUID()
  }

  /** Hops in this run that actually spent a provider turn. */
  countBudgetedHops(flowRunId: string): number {
    const rows = this.db
      .prepare('SELECT outcome FROM relay_hops WHERE flow_run_id = ?')
      .all(flowRunId) as { outcome: string }[]
    return rows.filter((row) =>
      isBudgetedOutcome(row.outcome as RelayHopOutcome),
    ).length
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
