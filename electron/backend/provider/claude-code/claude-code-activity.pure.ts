import type { ActivitySignal } from '../provider.types'

export type ActivityDelta = ActivitySignal | 'keep'

interface ClaudeActivityEvent {
  type?: unknown
  subtype?: unknown
  compact_metadata?: unknown
  compactMetadata?: unknown
  hook_event_name?: unknown
  hookEventName?: unknown
  event?: {
    type?: unknown
    content_block?: { type?: unknown }
    delta?: { type?: unknown; text?: unknown }
  }
  message?: {
    content?: Array<{ type?: unknown; name?: unknown }>
  }
}

function normalizeHookName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  return trimmed || null
}

function readHookName(event: ClaudeActivityEvent): string | null {
  return normalizeHookName(event.hook_event_name ?? event.hookEventName)
}

function isPreCompactHook(event: ClaudeActivityEvent): boolean {
  return event.type === 'system' && readHookName(event) === 'precompact'
}

function isPostCompactHook(event: ClaudeActivityEvent): boolean {
  return event.type === 'system' && readHookName(event) === 'postcompact'
}

function isCompactSystemEvent(event: ClaudeActivityEvent): boolean {
  const compactMetadata = event.compact_metadata ?? event.compactMetadata
  return (
    event.type === 'system' &&
    ((compactMetadata !== null && typeof compactMetadata === 'object') ||
      (typeof event.subtype === 'string' && event.subtype.includes('compact')))
  )
}

function isCompactionBlockStart(event: ClaudeActivityEvent): boolean {
  return (
    event.type === 'stream_event' &&
    event.event?.type === 'content_block_start' &&
    event.event.content_block?.type === 'compaction'
  )
}

function isCompactionBlockDelta(event: ClaudeActivityEvent): boolean {
  return (
    event.type === 'stream_event' &&
    event.event?.type === 'content_block_delta' &&
    event.event.delta?.type === 'compaction_delta'
  )
}

function isCompactionBlockStop(
  event: ClaudeActivityEvent,
  prevActivity: ActivitySignal | undefined,
): boolean {
  return (
    prevActivity === 'compacting' &&
    event.type === 'stream_event' &&
    event.event?.type === 'content_block_stop'
  )
}

function normalizeToolName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  return trimmed || null
}

export function deriveClaudeActivity(
  raw: unknown,
  prevActivity?: ActivitySignal,
): ActivityDelta {
  if (!raw || typeof raw !== 'object') return 'keep'
  const event = raw as ClaudeActivityEvent

  if (event.type === 'result') return null

  if (
    isPreCompactHook(event) ||
    isCompactSystemEvent(event) ||
    isCompactionBlockStart(event) ||
    isCompactionBlockDelta(event)
  ) {
    return 'compacting'
  }

  if (isPostCompactHook(event) || isCompactionBlockStop(event, prevActivity)) {
    return prevActivity === 'compacting' ? null : 'keep'
  }

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
