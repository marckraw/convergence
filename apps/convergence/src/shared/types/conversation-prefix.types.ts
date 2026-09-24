export interface ConversationPrefixTurn {
  id: string
  ordinal: number
  startedAt: string
  startMs: number | null
  endMs: number | null
}

/**
 * Per-turn sufficient statistics, never item payloads. A prefix alone cannot
 * know which turns recur in the suffix (agent work can interleave), so retain
 * all turn identities and spans. Their spans are already included in totalMs;
 * a continuing turn contributes only its extension when combined.
 */
export interface ConversationPrefix {
  turnCount: number
  turns: readonly ConversationPrefixTurn[]
  totalMs: number | null
  latestCompletedReplyId: string | null
}
