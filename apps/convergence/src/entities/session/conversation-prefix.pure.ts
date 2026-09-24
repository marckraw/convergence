/** Structural input keeps the reference usable by main without renderer imports. */
export interface ConversationFactItem {
  id: string
  sequence: number
  turnId: string | null
  kind: string
  actor?: string
  state: string
  createdAt: string
  updatedAt: string
}

import type {
  ConversationPrefix,
  ConversationPrefixTurn,
} from '../../shared/types/conversation-prefix.types'
export type {
  ConversationPrefix,
  ConversationPrefixTurn,
} from '../../shared/types/conversation-prefix.types'

export const EMPTY_CONVERSATION_PREFIX: ConversationPrefix = {
  turnCount: 0,
  turns: [],
  totalMs: null,
  latestCompletedReplyId: null,
}

export function summarizeConversationPrefix(
  items: readonly ConversationFactItem[],
): ConversationPrefix {
  return combineConversationPrefix(EMPTY_CONVERSATION_PREFIX, items)
}

function timestamp(value: string): number | null {
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function spanMs(turn: ConversationPrefixTurn): number {
  return turn.startMs === null || turn.endMs === null
    ? 0
    : Math.max(0, turn.endMs - turn.startMs)
}

/** Items, like the persisted conversation, must be in ascending sequence order. */
export function combineConversationPrefix(
  prefix: ConversationPrefix,
  items: readonly ConversationFactItem[],
): ConversationPrefix {
  const turns = new Map(prefix.turns.map((turn) => [turn.id, { ...turn }]))
  let turnCount = prefix.turnCount
  let totalMs = prefix.totalMs
  for (const item of items) {
    if (!item.turnId) continue
    let turn = turns.get(item.turnId)
    if (!turn) {
      turn = {
        id: item.turnId,
        ordinal: ++turnCount,
        startedAt: item.createdAt,
        startMs: null,
        endMs: null,
      }
      turns.set(item.turnId, turn)
    }
    const start = timestamp(item.createdAt)
    if (start === null) continue
    const end = timestamp(item.updatedAt) ?? start
    const previous = spanMs(turn)
    turn.startMs = turn.startMs === null ? start : Math.min(turn.startMs, start)
    turn.endMs = turn.endMs === null ? end : Math.max(turn.endMs, end)
    totalMs = (totalMs ?? 0) + spanMs(turn) - previous
  }
  return {
    turnCount,
    turns: [...turns.values()],
    totalMs,
    latestCompletedReplyId: combineLatestCompletedReplyId(prefix, items),
  }
}

export function combineTurnOrdinals(
  prefix: ConversationPrefix,
  items: readonly ConversationFactItem[],
): Map<string, number> {
  const ordinals = new Map(prefix.turns.map((turn) => [turn.id, turn.ordinal]))
  let count = prefix.turnCount
  for (const item of items) {
    if (item.turnId && !ordinals.has(item.turnId)) {
      ordinals.set(item.turnId, ++count)
    }
  }
  return ordinals
}

export function combineTurnStarts(
  prefix: ConversationPrefix,
  items: readonly ConversationFactItem[],
): Map<string, string> {
  const starts = new Map(prefix.turns.map((turn) => [turn.id, turn.startedAt]))
  for (const item of items) {
    if (item.turnId && !starts.has(item.turnId)) {
      starts.set(item.turnId, item.createdAt)
    }
  }
  return starts
}

export function combineConversationDurationMs(
  prefix: ConversationPrefix,
  items: readonly ConversationFactItem[],
): number | null {
  return combineConversationPrefix(prefix, items).totalMs
}

export function combineLatestCompletedReplyId(
  prefix: ConversationPrefix,
  items: readonly ConversationFactItem[],
): string | null {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (
      item.kind === 'message' &&
      item.actor === 'assistant' &&
      item.state === 'complete'
    ) {
      return item.id
    }
  }
  return prefix.latestCompletedReplyId
}
