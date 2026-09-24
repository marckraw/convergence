import {
  combineConversationPrefix,
  combineConversationDurationMs,
  type ConversationPrefix,
  type ConversationItem,
} from '@/entities/session'
import { formatDuration } from './transcript-entry-view-model.pure'

export interface ConversationTurnSpan {
  start: number
  end: number
}

type StreamingTextItem = Extract<
  ConversationItem,
  { kind: 'message' | 'thinking' }
>

export interface StreamingDurationTarget {
  totalMs: number | null
  streamingItem: StreamingTextItem | null
  turnSpan: ConversationTurnSpan | null
}

export function getConversationTotalDurationMs(
  prefix: ConversationPrefix,
  items: ConversationItem[],
): number | null {
  return combineConversationDurationMs(prefix, items)
}

/**
 * The list-change reading Elapsed extends (MAR-3310 F1g). The prefix
 * supplies old spans, including the start of a streaming turn in the window.
 */
export function readStreamingDurationTarget(
  prefix: ConversationPrefix,
  items: ConversationItem[],
): StreamingDurationTarget {
  const collected = combineConversationPrefix(prefix, items)
  let streamingItem: StreamingTextItem | null = null
  for (const item of items) {
    if (isStreamingTextItem(item)) streamingItem = item
  }
  const turn = collected.turns.find((turn) => turn.id === streamingItem?.turnId)
  return {
    totalMs: collected.totalMs,
    streamingItem,
    turnSpan:
      turn && turn.startMs !== null && turn.endMs !== null
        ? { start: turn.startMs, end: turn.endMs }
        : null,
  }
}

/**
 * Base total plus the part of a live `updatedAt` that is past the turn's
 * end. Anything else — no span, an unreadable time, a time already inside
 * the span — leaves the base untouched.
 */
export function extendConversationTotalMs(
  baseMs: number | null,
  turnSpan: ConversationTurnSpan | null,
  liveUpdatedAt: string | null,
): number | null {
  if (turnSpan === null || liveUpdatedAt === null) return baseMs
  const live = parseTimestamp(liveUpdatedAt)
  if (live === null || live <= turnSpan.end) return baseMs
  return (baseMs ?? 0) + (live - turnSpan.end)
}

export function formatConversationDurationMs(
  totalMs: number | null,
): string | null {
  if (totalMs === null || totalMs < 1000) return null
  return formatDuration(totalMs)
}

export function formatConversationTotalDuration(
  prefix: ConversationPrefix,
  items: ConversationItem[],
): string | null {
  return formatConversationDurationMs(
    getConversationTotalDurationMs(prefix, items),
  )
}

function isStreamingTextItem(
  item: ConversationItem,
): item is StreamingTextItem {
  return (
    (item.kind === 'message' || item.kind === 'thinking') &&
    item.state === 'streaming' &&
    item.turnId !== null
  )
}

function parseTimestamp(value: string): number | null {
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}
