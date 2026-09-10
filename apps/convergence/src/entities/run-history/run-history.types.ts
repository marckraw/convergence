import type { CrewHail } from '@/entities/crew-hail'
import type { RelayHop } from '@/entities/session-relay'

/**
 * The renderer's mirror of the backend's history vocabulary (R12).
 *
 * A separate vocabulary from `RelayHopOutcome` and `CrewHailReason` on
 * purpose: those are what the engine WRITES, this is what a human reads, and
 * one normalizer between them is what keeps a rename in either from silently
 * changing the other.
 */
export type RunHistoryOutcome =
  | 'delivered'
  | 'queued'
  | 'held'
  | 'delivery-failed'
  | 'limit-reached'
  | 'handed-back'
  | 'parked'
  | 'reply-overdue'
  | 'loop-closed'
  | 'unknown'

export type RunStatusWord =
  | 'handed-back'
  | 'needs-you'
  | 'running'
  | 'finished-quiet'
  | 'unknown'

/** Which of the four ways a run needs him: never merely "needs you". */
export type RunNeedsYouReason = 'failed' | 'limit' | 'parked' | 'stalled'

export interface RunStatus {
  word: RunStatusWord
  /** Set only when the word is `needs-you`. */
  reason: RunNeedsYouReason | null
}

/** One generation of the run: every hop whose wire was on its Nth pass. */
export interface RelayRunLap {
  lap: number
  hops: RelayHop[]
}

export interface RelayRunCounts {
  deliveries: number
  failures: number
  laps: number
  events: number
}

/** One user-visible run: everything one `flowRunId` ever recorded. */
export interface RelayRun {
  flowRunId: string
  crewId: string
  startedAt: string
  endedAt: string
  lastActivityAt: string
  owedBy: {
    hopId: string
    targetSessionId: string | null
    firedAt: string
  } | null
  handedBackAt: string | null
  laps: RelayRunLap[]
  hails: CrewHail[]
  status: RunStatus
  counts: RelayRunCounts
}

export interface RelayRunPage {
  runs: RelayRun[]
  /**
   * Calls with no run id. A station whose baton nothing answered may have no
   * outgoing wire at all, so its call has no hop and no run to hang under --
   * and attaching it to the newest run would blame a chain that was fine.
   */
  unattributedHails: CrewHail[]
  /**
   * The design's word for every event on this page, by hop or hail id.
   *
   * Sent across rather than recomputed here. The renderer cannot import from
   * `electron/`, so a normalizer on this side would be a second vocabulary
   * free to drift from the engine's with nothing agreeing them — and a value
   * that crosses the tree boundary needs no barrier, while a literal does.
   */
  outcomes: Record<string, RunHistoryOutcome>
  nextCursor: RunHistoryCursor | null
  hasMore: boolean
}

export interface ListRunsOptions {
  limit?: number
  /** The oldest run already held; the page resumes below it. */
  before?: RunHistoryCursor | null
}

export interface RunHistoryCursor {
  asOf: string
  live: 0 | 1
  lastActivityAt: string
  flowRunId: string
}
