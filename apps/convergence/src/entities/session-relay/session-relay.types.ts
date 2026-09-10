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
  /**
   * A first message this wire sends on its own, ahead of the payload, or null
   * to deliver straight away. `/clear` here recycles a long-lived target: the
   * same wire wipes it and re-briefs it every lap.
   */
  opener: string | null
  /**
   * The line the source's final assistant message must end with for this wire
   * to fire, or null to fire whenever the source finishes.
   *
   * Stored as the user wrote it — `BATON: horse` by convention — so the wire's
   * switch and the agent's own words are the same text.
   */
  conditionToken: string | null
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
  /** The crew spent its whole delivery limit for the run (MAR-2759). */
  | 'skipped-round-budget'
  /** The human working: they sent that turn quiet, so the wire held (F10). */
  | 'skipped-muted'
  /** The wire working as drawn: the message named another route, or none. */
  | 'skipped-baton'
  /** The settle had nothing to carry: a tool-only turn owed nothing (L1). */
  | 'skipped-no-message'
  | 'error'

/** One firing, recorded whether or not anything was carried. */
export interface RelayHop {
  /** Recorded source settle; null on legacy rows, which are not folded. */
  settleId: string | null
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
  /** The baton the finishing message handed on, when it declared one. */
  baton: string | null
  /** Which round of the loop this hop was, or null if it spent none. */
  roundNumber: number | null
  /**
   * Which lap of THIS WIRE inside the run the hop was (R2), or null on a row
   * written before laps existed. Null is derived, never defaulted: history
   * recomputes it from the ledger by the rule that produced the stored ones.
   */
  lapNumber: number | null
  /**
   * When the station this hop landed work in came back, or null while it
   * still owes it. History reads it to tell a run still moving from one that
   * finished quiet, which is a question the engine's memory cannot answer
   * after a restart.
   */
  settledAt: string | null
  /**
   * Wider than `RelayHopOutcome` on purpose: that union is what this build
   * writes, while a stored row may carry a word an older or newer build used.
   */
  outcome: string
  error: string | null
}

/** What a cleared trail left behind. */
export interface ClearRelayHopsResult {
  /** Ledger rows deleted. */
  removed: number
  /** Rows left standing because their flow run is still in flight. */
  kept: number
}

export interface CreateSessionRelayInput {
  crewId: string
  sourceSessionId: string
  action: RelayAction
  targetSessionId?: string | null
  spawnSpec?: RelaySpawnSpec | null
  instruction?: string | null
  opener?: string | null
  conditionToken?: string | null
  armed?: boolean
}

export interface UpdateSessionRelayInput {
  sourceSessionId?: string
  action?: RelayAction
  targetSessionId?: string | null
  spawnSpec?: RelaySpawnSpec | null
  instruction?: string | null
  opener?: string | null
  conditionToken?: string | null
  armed?: boolean
}
