import type { ConversationItem } from '@/entities/session'
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
  items: ConversationItem[],
): number | null {
  return collectConversationTurns(items).totalMs
}

/**
 * The list-change reading Elapsed extends (MAR-3310 F1g). One walk, same
 * span rules as the base total, plus the newest streaming text item.
 */
export function readStreamingDurationTarget(
  items: ConversationItem[],
): StreamingDurationTarget {
  const collected = collectConversationTurns(items)
  const turnId = collected.streamingItem?.turnId
  return {
    totalMs: collected.totalMs,
    streamingItem: collected.streamingItem,
    turnSpan: turnId ? (collected.spansByTurn.get(turnId) ?? null) : null,
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
  items: ConversationItem[],
): string | null {
  return formatConversationDurationMs(getConversationTotalDurationMs(items))
}

function collectConversationTurns(items: ConversationItem[]): {
  totalMs: number | null
  spansByTurn: Map<string, ConversationTurnSpan>
  streamingItem: StreamingTextItem | null
} {
  const spansByTurn = new Map<string, ConversationTurnSpan>()
  let streamingItem: StreamingTextItem | null = null

  for (const item of items) {
    if (isStreamingTextItem(item)) streamingItem = item
    if (!item.turnId) continue

    const start = parseTimestamp(item.createdAt)
    const end = parseTimestamp(item.updatedAt) ?? start
    if (start === null) continue

    const existing = spansByTurn.get(item.turnId)
    if (!existing) {
      spansByTurn.set(item.turnId, { start, end: end ?? start })
      continue
    }

    if (start < existing.start) existing.start = start
    if (end !== null && end > existing.end) existing.end = end
  }

  if (spansByTurn.size === 0) {
    return { totalMs: null, spansByTurn, streamingItem }
  }

  let total = 0
  for (const span of spansByTurn.values()) {
    if (span.end > span.start) total += span.end - span.start
  }
  return { totalMs: total, spansByTurn, streamingItem }
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
