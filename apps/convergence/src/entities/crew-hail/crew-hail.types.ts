/**
 * One call for Marcin: a crew's loop that parked, capped, or went quiet.
 *
 * The mirror of the backend record. A hail is not a hop — the trail says what
 * a wire did, a hail says what a crew needs from a human — so it lives beside
 * the ledger rather than inside it.
 *
 * `loop-closed` is retired from the written union (R2 replaced the once-per-run
 * refusal with laps) and stays readable through `reason: string`, which is
 * wider than the union for exactly this reason.
 */
export type CrewHailReason =
  | 'terminal'
  | 'unrouted'
  | 'round-budget'
  /** The 20-hop backstop tripped and disarmed a wire (R3). */
  | 'budget'
  /** A wire could not deliver at all; nothing is coming next (R3). */
  | 'delivery-failed'
  | 'stall'

export interface CrewHail {
  id: string
  crewId: string
  flowRunId: string | null
  /**
   * Wider than `CrewHailReason` on purpose, the same split the ledger's
   * outcomes use: a stored row may carry a word an older or newer build wrote,
   * and it must read as something neutral rather than blank.
   */
  reason: string
  sessionId: string
  baton: string | null
  /** The finishing message, attached so the hail can be read where it lands. */
  message: string | null
  detail: string
  raisedAt: string
  acknowledgedAt: string | null
}
