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
  /**
   * The account the spawned session is born on. Null means "whatever the
   * enrolled default is when this fires", not "ambient" -- the engine resolves
   * it at firing time, so a wire drawn before an account was enrolled starts
   * using it without being redrawn.
   *
   * Chosen here rather than corrected later because Codex fixes a session's
   * credential at its first turn and refuses to change it afterwards.
   */
  providerAccountId: string | null
}

/**
 * Why a firing ended the way it did. Every one of these writes a ledger row:
 * a wire the user cannot watch fire is a silent hop, and silent hops are
 * forbidden. There is deliberately no member for "the wire was disarmed" --
 * a switch at rest never fires, so it has no outcome to name.
 *
 * `skipped-already-fired` is the loop law working rather than anything going
 * wrong: a wire fires at most once per flow run, so the second time round a
 * loop it declines quietly and stays armed for the next run.
 *
 * `skipped-muted` is the human working: they sent that turn quiet (F10), so
 * the wire declined and stays armed for the next one. It writes a row for the
 * same reason every other skip does -- "my wire did not fire" must always have
 * a visible answer, and "because you asked me not to" is one.
 */
export type RelayHopOutcome =
  | 'delivered'
  | 'queued'
  | 'spawned'
  | 'skipped-failed'
  | 'skipped-budget'
  | 'skipped-already-fired'
  | 'skipped-muted'
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
  /**
   * A standing brief prepended to every message this wire carries, or null to
   * carry the message exactly as the source session wrote it. It belongs to
   * the wire rather than the hop: a wire is a rule, and the rule is the same
   * every time it fires.
   */
  instruction: string | null
  /**
   * A first message sent on its own, ahead of the payload, or null to deliver
   * the payload straight away. It exists for the recycled worker: `/clear`
   * here turns a long-lived target session into a fresh one every lap, wiped
   * and re-briefed by the same wire.
   *
   * Hail wires only. A spawn opens a session that was never used, so there is
   * nothing to clear.
   */
  opener: string | null
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
  /**
   * Deliberately wider than `RelayHopOutcome`, which is the vocabulary this
   * build may WRITE. The ledger is a historical record, and a row written by
   * an older or newer Convergence must still read rather than render blank --
   * v0.45.22 shipped a `skipped-disarmed` outcome this build no longer knows.
   */
  outcome: string
  error: string | null
}

export interface CreateSessionRelayInput {
  crewId: string
  sourceSessionId: string
  action: RelayAction
  targetSessionId?: string | null
  spawnSpec?: RelaySpawnSpec | null
  instruction?: string | null
  opener?: string | null
  armed?: boolean
}

export interface UpdateSessionRelayInput {
  sourceSessionId?: string
  action?: RelayAction
  targetSessionId?: string | null
  spawnSpec?: RelaySpawnSpec | null
  instruction?: string | null
  opener?: string | null
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
      // Absent in specs written before accounts rode the wires; those keep
      // resolving to the enrolled default, which is the fix they were missing.
      providerAccountId:
        typeof parsed.providerAccountId === 'string' &&
        parsed.providerAccountId.length > 0
          ? parsed.providerAccountId
          : null,
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
    // Read defensively rather than trusted: a row written before the column
    // existed reads as undefined on some sqlite paths, and "no instruction" is
    // the honest answer for every one of them.
    instruction: row.instruction ?? null,
    // Same defensive read as the instruction above, for the same reason: a row
    // written before openers existed has no first send to make.
    opener: row.opener ?? null,
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
    outcome: row.outcome,
    error: row.error,
  }
}
