import type { ConversationItem } from '@/entities/session'
import { formatDuration } from './transcript-entry-view-model.pure'

export function getConversationTotalDurationMs(
  items: ConversationItem[],
): number | null {
  type TurnSpan = { start: number; end: number }
  const spansByTurn = new Map<string, TurnSpan>()

  for (const item of items) {
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

  if (spansByTurn.size === 0) return null

  let total = 0
  for (const span of spansByTurn.values()) {
    if (span.end > span.start) total += span.end - span.start
  }
  return total
}

export function formatConversationTotalDuration(
  items: ConversationItem[],
): string | null {
  const totalMs = getConversationTotalDurationMs(items)
  if (totalMs === null || totalMs < 1000) return null
  return formatDuration(totalMs)
}

function parseTimestamp(value: string): number | null {
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}
