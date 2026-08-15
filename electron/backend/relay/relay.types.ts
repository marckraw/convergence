import type { RelayHopRow, SessionRelayRow } from '../database/database.types'

/**
 * The one trigger v1 ships: a session coming to rest. The union exists so the
 * column has a name in the type system, not because a second trigger is queued.
 */
export type RelayTrigger = 'settled'

/**
 * What a relay does when it fires: carry the payload into a session that
 * already exists, or open a brand new one and start it on the payload.
 */
export type RelayAction = 'hail' | 'spawn'

/**
 * Everything needed to open the session a spawn relay creates. Nothing is
 * inferred from the source session: a wire that quietly changed provider or
 * project because its far end changed would be a wire nobody could reason
 * about, so every field is stated on the relay itself.
 */
export interface RelaySpawnSpec {
  /** Null opens a global session, not tied to any project. */
  projectId: string | null
  providerId: string
  model: string | null
  effort: string | null
  /** Starting name; the auto-namer may replace it once the turn produces text. */
  name: string
}

/**
 * Why a firing ended the way it did. Every one of these writes a ledger row:
 * a wire the user cannot watch is a silent hop, and silent hops are forbidden.
 */
export type RelayHopOutcome =
  | 'delivered'
  | 'queued'
  | 'spawned'
  | 'skipped-disarmed'
  | 'skipped-failed'
  | 'skipped-budget'
  | 'error'

/**
 * One wire inside a crew: when its source session settles, it carries that
 * session's last assistant message to its target. Convergence is the
 * switchboard -- the agents at either end never learn the wire exists.
 */
export interface SessionRelay {
  id: string
  crewId: string
  sourceSessionId: string
  trigger: RelayTrigger
  action: RelayAction
  targetSessionId: string | null
  /** Set for `spawn` relays, null for `hail`. */
  spawnSpec: RelaySpawnSpec | null
  armed: boolean
  createdAt: string
  updatedAt: string
}

/** One firing, recorded whether or not anything was delivered. */
export interface RelayHop {
  id: string
  relayId: string
  crewId: string
  flowRunId: string
  firedAt: string
  sourceSessionId: string
  targetSessionId: string | null
  spawnedSessionId: string | null
  triggerStatus: string
  payloadPreview: string | null
  outcome: RelayHopOutcome
  error: string | null
}

export interface CreateSessionRelayInput {
  crewId: string
  sourceSessionId: string
  action: RelayAction
  targetSessionId?: string | null
  spawnSpec?: RelaySpawnSpec | null
  armed?: boolean
}

export interface UpdateSessionRelayInput {
  sourceSessionId?: string
  action?: RelayAction
  targetSessionId?: string | null
  spawnSpec?: RelaySpawnSpec | null
  armed?: boolean
}

/**
 * A spec written by an older or newer build must never crash a relay read --
 * the wire degrades to "unspecified" and the engine records an honest error
 * hop rather than the whole crew failing to load.
 */
function parseSpawnSpec(json: string | null): RelaySpawnSpec | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as Partial<RelaySpawnSpec>
    if (typeof parsed?.providerId !== 'string' || !parsed.providerId) {
      return null
    }
    return {
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : null,
      providerId: parsed.providerId,
      model: typeof parsed.model === 'string' ? parsed.model : null,
      effort: typeof parsed.effort === 'string' ? parsed.effort : null,
      name: typeof parsed.name === 'string' ? parsed.name : 'Relayed session',
    }
  } catch {
    return null
  }
}

export function sessionRelayFromRow(row: SessionRelayRow): SessionRelay {
  return {
    id: row.id,
    crewId: row.crew_id,
    sourceSessionId: row.source_session_id,
    trigger: row.trigger as RelayTrigger,
    action: row.action as RelayAction,
    targetSessionId: row.target_session_id,
    spawnSpec: parseSpawnSpec(row.spawn_spec_json),
    armed: row.armed !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function relayHopFromRow(row: RelayHopRow): RelayHop {
  return {
    id: row.id,
    relayId: row.relay_id,
    crewId: row.crew_id,
    flowRunId: row.flow_run_id,
    firedAt: row.fired_at,
    sourceSessionId: row.source_session_id,
    targetSessionId: row.target_session_id,
    spawnedSessionId: row.spawned_session_id,
    triggerStatus: row.trigger_status,
    payloadPreview: row.payload_preview,
    outcome: row.outcome as RelayHopOutcome,
    error: row.error,
  }
}
