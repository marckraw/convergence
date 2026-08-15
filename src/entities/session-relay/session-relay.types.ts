/**
 * A relay is one wire inside a crew: when its source session settles,
 * Convergence carries that session's last assistant message to its target.
 * Agents never call agents — the switchboard does, and only when armed.
 */
export type RelayAction = 'hail' | 'spawn'

/** The session a spawn relay opens, stated in full on the wire itself. */
export interface RelaySpawnSpec {
  /** Null opens a global session, not tied to any project. */
  projectId: string | null
  providerId: string
  model: string | null
  effort: string | null
  name: string
}

export interface SessionRelay {
  id: string
  crewId: string
  sourceSessionId: string
  trigger: 'settled'
  action: RelayAction
  targetSessionId: string | null
  spawnSpec: RelaySpawnSpec | null
  armed: boolean
  createdAt: string
  updatedAt: string
}

export type RelayHopOutcome =
  | 'delivered'
  | 'queued'
  | 'spawned'
  | 'skipped-disarmed'
  | 'skipped-failed'
  | 'skipped-budget'
  | 'error'

/** One firing, recorded whether or not anything was carried. */
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
