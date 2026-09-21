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

/**
 * Which of three seats a conversation sits on, as the drill sees it
 * (MAR-3287 R1).
 *
 * - `none`: in no crew at all. The drill is not this conversation's business.
 * - `other-role`: a seat in at least one crew, mastermind in none. A seat
 *   whose role was never chosen (a NULL role, written before seats had
 *   roles) is here, because it IS a seat, and the person needs to be told
 *   where to change it.
 * - `mastermind`: the mastermind of at least one crew.
 *
 * One three-valued answer rather than two booleans ("in a crew?", "a
 * mastermind?"), so the two can never disagree about the same seat.
 */
export type DrillSeat = 'none' | 'other-role' | 'mastermind'

/** What the surface needs to decide whether to offer the drill at all (R6). */
export interface DrillDescription {
  /**
   * Which seat this is (MAR-3287 R1). The surface decides what to DRAW from
   * this and never from `reason`: `none` draws nothing, `other-role` draws a
   * disabled control that says where to set the role.
   */
  seat: DrillSeat
  /**
   * Whether this conversation is the KIND that can ever run the drill: a
   * crew's mastermind seat (MAR-3256 R1). Exactly `seat === 'mastermind'`.
   *
   * Separate from `offered` because the two answer different questions and
   * the surface needs both. `offered` is "can it start right now", which
   * flickers false all day long -- mid-turn, awaiting an approval, queued
   * input pending -- and a control that vanished every time a turn ran would
   * be a control nobody trusts. `eligible` is the stable half: false means
   * the control is not this conversation's business at all and is never
   * drawn; true with `offered: false` means drawn, disabled, and saying why.
   *
   * It exists as a field rather than being inferred from `reason` because the
   * alternative is a renderer matching on an English sentence, and a sentence
   * is copy: the day somebody rewords the refusal, a string comparison starts
   * silently answering the wrong question.
   */
  eligible: boolean
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
  /**
   * The role this session holds in each crew it has a seat in, one entry per
   * crew; empty when it has no seat at all (MAR-3287 R1). `null` is a role
   * nobody ever chose. The service turns this into a `DrillSeat` with
   * `resolveDrillSeat`, the one place that mapping is written.
   */
  seatRolesOf(sessionId: string): ReadonlyArray<string | null>
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
