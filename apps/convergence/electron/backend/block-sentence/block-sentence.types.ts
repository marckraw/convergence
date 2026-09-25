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
