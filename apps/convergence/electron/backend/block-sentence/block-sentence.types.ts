/**
 * One stored sentence (R4), keyed by the block's first item. It lives in its
 * own table and is never a conversation item: nothing that builds a
 * transcript, a fork, a compaction or a prompt for the agent reads it.
 */
export interface BlockSentence {
  sessionId: string
  firstItemId: string
  lastItemId: string
  sentence: string
  model: string
  createdAt: string
}

/** What the renderer is told when a session's sentences change. */
export interface BlockSentencesChangedEvent {
  sessionId: string
}

/** What asked for a block's line (MAR-3422 CV3d R3). */
export type BlockSentenceTrigger = 'block-closed' | 'turn-ended'

/** How one request ended (R3). */
export type BlockSentenceOutcome = 'stored' | 'refused' | 'call-failed'

/**
 * One request to the model, whatever became of it (R3). It lives in its own
 * table beside the sentences and, like them, is never a conversation item:
 * nothing that builds a transcript, a fork, a compaction or a prompt reads
 * it. It never holds a raw error message -- only a short failure class.
 */
export interface BlockSentenceAttempt {
  sessionId: string
  turnId: string
  firstItemId: string
  lastItemId: string
  trigger: BlockSentenceTrigger
  outcome: BlockSentenceOutcome
  /** Luna's refused line, capped; null unless refused. */
  refusedText: string | null
  /** The gate's reasons as JSON when refused; the failure class when failed. */
  reasons: string | null
  queuedAt: string
  startedAt: string
  finishedAt: string
}
