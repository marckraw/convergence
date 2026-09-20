/** The three beats of the drill, in the order they run (MAR-3255 R4). */
export type DrillBeat = 'sealing' | 'compacting' | 'resuming'

/**
 * How a run ended.
 *
 * A VALUE, never a rejected promise, all the way out to the renderer (R6): a
 * refusal is an answer the user is owed in words, and an error crossing IPC
 * arrives as a string somebody has to parse to find out which beat stopped.
 */
export type DrillOutcome =
  | { ok: true }
  | { ok: false; beat: DrillBeat; reason: string }

/**
 * A beat starting, or a routine ending (R5).
 *
 * `beat` is what the routine is doing NOW, and `null` means it is not
 * running: the last event of every run carries null, with `reason` set only
 * when the run failed.
 */
export interface DrillChange {
  sessionId: string
  beat: DrillBeat | null
  reason?: string
}

/** What the surface needs to decide whether to offer the drill at all (R6). */
export interface DrillDescription {
  /** A mastermind seat AND a conversation that could be compacted now. */
  offered: boolean
  /** Why it is not offered, or null when it is. */
  reason: string | null
  /** Non-null while a routine is running on this session. */
  beat: DrillBeat | null
}

/**
 * The settle, as the drill reads it.
 *
 * A subset of `SessionSettledEvent` and only the fields this service asks
 * about, so the gateway below can be satisfied by a fake that starts no
 * provider.
 */
export interface DrillSettleEvent {
  sessionId: string
  status: 'completed' | 'failed'
  dispatchIds: string[]
  answerWindow?: { message: string | null }
}

/**
 * The narrow face of `SessionService` the drill is allowed to touch.
 *
 * The same seam, and for the same reason, as `RelaySessionGateway`: this
 * routine spends a provider turn and then rewrites a conversation's memory,
 * so its tests substitute this and can never accidentally do either.
 */
export interface ContextDrillSessionGateway {
  /** Whether this session is a crew's mastermind seat (R4, step 1). */
  isMastermindSeat(sessionId: string): boolean
  describeCompactionReadiness(
    sessionId: string,
  ): { ready: true } | { ready: false; reason: string }
  onSessionSettled(listener: (event: DrillSettleEvent) => void): () => void
  holdQueue(sessionId: string): void
  releaseQueue(sessionId: string): void
  /** The only send that passes the hold. Returns the dispatch id. */
  sendDrillBeat(sessionId: string, text: string): Promise<string>
  getLastAssistantMessageText(sessionId: string): string | null
  compactContext(sessionId: string): Promise<unknown>
  addContextDrillNote(sessionId: string, text: string): void
}
