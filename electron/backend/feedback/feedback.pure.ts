import { MAX_DETAIL_LENGTH } from './feedback.constants'
import type { FeedbackPriority } from './feedback.types'

export interface ErrorDetail {
  message: string
  raw: string
}

export function isFeedbackPriority(value: unknown): value is FeedbackPriority {
  return value === 'low' || value === 'medium' || value === 'high'
}

export function parseFeedbackErrorDetail(body: string): ErrorDetail {
  const trimmed = body.trim()
  if (!trimmed) {
    return { message: '', raw: '' }
  }

  let detail: string | null = null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      const candidate = record.error ?? record.message ?? record.detail
      if (typeof candidate === 'string' && candidate.trim()) {
        detail = candidate.trim()
      } else if (Array.isArray(record.errors)) {
        const messages = record.errors
          .map((entry) => {
            if (typeof entry === 'string') return entry
            if (entry && typeof entry === 'object' && 'message' in entry) {
              const message = (entry as { message?: unknown }).message
              if (typeof message === 'string') return message
            }
            return null
          })
          .filter((value): value is string => Boolean(value && value.trim()))
        if (messages.length > 0) {
          detail = messages.join('; ')
        }
      }
      if (!detail) {
        const compact = JSON.stringify(parsed)
        detail = compact === '{}' ? '' : compact
      }
    } else if (typeof parsed === 'string' && parsed.trim()) {
      detail = parsed.trim()
    } else {
      detail = trimmed
    }
  } catch {
    detail = trimmed
  }

  if (!detail) {
    return { message: '', raw: trimmed }
  }

  if (detail.length > MAX_DETAIL_LENGTH) {
    detail = `${detail.slice(0, MAX_DETAIL_LENGTH)}…`
  }
  return { message: detail, raw: trimmed }
}
