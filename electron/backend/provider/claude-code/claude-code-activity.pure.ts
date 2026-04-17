import type { ActivitySignal } from '../provider.types'

export type ActivityDelta = ActivitySignal | 'keep'

interface ClaudeActivityEvent {
  type?: unknown
  event?: {
    type?: unknown
    delta?: { type?: unknown; text?: unknown }
  }
  message?: {
    content?: Array<{ type?: unknown; name?: unknown }>
  }
}

function normalizeToolName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  return trimmed || null
}

export function deriveClaudeActivity(raw: unknown): ActivityDelta {
  if (!raw || typeof raw !== 'object') return 'keep'
  const event = raw as ClaudeActivityEvent

  if (event.type === 'result') return null

  if (event.type === 'stream_event') {
    if (
      event.event?.type === 'content_block_delta' &&
      event.event.delta?.type === 'text_delta' &&
      typeof event.event.delta.text === 'string'
    ) {
      return 'streaming'
    }
    return 'keep'
  }

  if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
    for (const block of event.message.content) {
      if (block?.type === 'tool_use') {
        const name = normalizeToolName(block.name)
        if (name) return `tool:${name}`
      }
    }
  }

  return 'keep'
}
