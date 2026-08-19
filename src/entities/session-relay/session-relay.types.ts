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
  /**
   * The account the spawned session is born on. Null is not "ambient" -- it
   * means "whatever the enrolled default is when this wire fires", resolved by
   * the engine at firing time.
   */
  providerAccountId: string | null
}

export interface SessionRelay {
  id: string
  crewId: string
  sourceSessionId: string
  trigger: 'settled'
  action: RelayAction
  targetSessionId: string | null
  spawnSpec: RelaySpawnSpec | null
  /**
   * A standing brief prepended to every message this wire carries, or null to
   * carry the message exactly as the source session wrote it.
   */
  instruction: string | null
  armed: boolean
  createdAt: string
  updatedAt: string
}

export type RelayHopOutcome =
  | 'delivered'
  | 'queued'
  | 'spawned'
  | 'skipped-failed'
  | 'skipped-budget'
  /** The loop law working: a wire fires at most once per flow run. */
  | 'skipped-already-fired'
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
  /**
   * Wider than `RelayHopOutcome` on purpose: that union is what this build
   * writes, while a stored row may carry a word an older or newer build used.
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
  armed?: boolean
}

export interface UpdateSessionRelayInput {
  sourceSessionId?: string
  action?: RelayAction
  targetSessionId?: string | null
  spawnSpec?: RelaySpawnSpec | null
  instruction?: string | null
  armed?: boolean
}
