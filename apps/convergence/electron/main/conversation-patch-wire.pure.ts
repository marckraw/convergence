import { isDeepStrictEqual } from 'node:util'
import type {
  ConversationItem,
  ConversationPatchEvent,
} from '../backend/session/conversation-item.types'
import type { ConversationWireEvent } from '../../src/shared/types/conversation-item.types'

type StreamingText = Extract<ConversationItem, { kind: 'message' | 'thinking' }>

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
  if (
    !text.startsWith(previousText) ||
    !isDeepStrictEqual(facts, previousFacts)
  ) {
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
