import { isDeepStrictEqual } from 'node:util'
import type {
  ConversationItem,
  ConversationPatchEvent,
} from '../backend/session/conversation-item.types'
import type { ConversationWireEvent } from '../../src/shared/types/conversation-item.types'

type StreamingText = Extract<ConversationItem, { kind: 'message' | 'thinking' }>

/** A missing key and an explicit `undefined` are the same fact; `null` stays. */
function factsMatch(left: object, right: object): boolean {
  return isDeepStrictEqual(dropUndefined(left), dropUndefined(right))
}

function dropUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => dropUndefined(entry))
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) continue
      copy[key] = dropUndefined(child)
    }
    return copy
  }
  return value
}

/** Adapter: only text growth crosses IPC as an append; all other facts stay full. */
export function conversationPatchWire(
  previous: StreamingText | undefined,
  event: ConversationPatchEvent,
): { wire: ConversationWireEvent<ConversationItem>; remember?: StreamingText } {
  const item = event.item
  if (
    (item.kind !== 'message' && item.kind !== 'thinking') ||
    item.state !== 'streaming'
  ) {
    return { wire: event }
  }
  if (!previous || event.op === 'add') return { wire: event, remember: item }

  const {
    text: previousText,
    updatedAt: previousUpdatedAt,
    ...previousFacts
  } = previous
  const { text, updatedAt, ...facts } = item
  // updatedAt travels with the append; it is deliberately not an ordering clock.
  void previousUpdatedAt
  if (!text.startsWith(previousText) || !factsMatch(facts, previousFacts)) {
    return { wire: event }
  }
  return {
    wire: {
      op: 'append',
      sessionId: event.sessionId,
      itemId: item.id,
      baseLength: previousText.length,
      append: text.slice(previousText.length),
      updatedAt,
    },
    remember: item,
  }
}

export type ConversationWireMemory = Map<string, Map<string, StreamingText>>

export function nextWireMemory(
  previous: ConversationWireMemory,
  event: ConversationPatchEvent,
): {
  wire: ConversationWireEvent<ConversationItem>
  memory: ConversationWireMemory
} {
  const memory = new Map(previous)
  const items = new Map(memory.get(event.sessionId))
  const prior = items.get(event.item.id)
  const { wire, remember } = conversationPatchWire(prior, event)
  // A prefix-preserving full patch is what the renderer now holds, so the
  // next growth is compared against it. A non-prefix rewrite still forgets:
  // the existing pure case requires the following event to go out full.
  const retained = remember ?? streamingFullPatchToKeep(prior, event)
  if (retained) items.set(event.item.id, retained)
  else items.delete(event.item.id)
  if (items.size) memory.set(event.sessionId, items)
  else memory.delete(event.sessionId)
  return { wire, memory }
}

function streamingFullPatchToKeep(
  prior: StreamingText | undefined,
  event: ConversationPatchEvent,
): StreamingText | undefined {
  const item = event.item
  if (!prior) return undefined
  if (item.kind !== 'message' && item.kind !== 'thinking') return undefined
  if (item.state !== 'streaming') return undefined
  if (!item.text.startsWith(prior.text)) return undefined
  return item
}
