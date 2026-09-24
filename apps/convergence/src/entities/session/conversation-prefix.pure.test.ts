import { describe, expect, it } from 'vitest'
import type { ConversationFactItem } from './conversation-prefix.pure'
import { conversationPrefixFixtures } from './conversation-prefix.fixtures'
import {
  combineConversationPrefix,
  combineConversationDurationMs,
  combineLatestCompletedReplyId,
  combineTurnOrdinals,
  combineTurnStarts,
  EMPTY_CONVERSATION_PREFIX,
  summarizeConversationPrefix,
} from './conversation-prefix.pure'

// Independent full-list oracles pin pre-window semantics (and R5 ordinals).
function fullFacts(items: ConversationFactItem[]) {
  const starts = new Map<string, string>()
  const ordinals = new Map<string, number>()
  const spans = new Map<string, { start: number; end: number }>()
  let reply: string | null = null
  for (const item of items) {
    if (
      item.kind === 'message' &&
      item.actor === 'assistant' &&
      item.state === 'complete'
    )
      reply = item.id
    if (!item.turnId) continue
    if (!starts.has(item.turnId)) {
      starts.set(item.turnId, item.createdAt)
      ordinals.set(item.turnId, ordinals.size + 1)
    }
    const start = new Date(item.createdAt).getTime()
    if (Number.isNaN(start)) continue
    const parsedEnd = new Date(item.updatedAt).getTime()
    const end = Number.isNaN(parsedEnd) ? start : parsedEnd
    const old = spans.get(item.turnId)
    spans.set(item.turnId, {
      start: Math.min(old?.start ?? start, start),
      end: Math.max(old?.end ?? end, end),
    })
  }
  return {
    starts,
    ordinals,
    reply,
    duration: spans.size
      ? [...spans.values()].reduce(
          (sum, s) => sum + Math.max(0, s.end - s.start),
          0,
        )
      : null,
  }
}

describe('whole-conversation prefix, every split property', () => {
  it('the empty reference is the empty prefix', () => {
    expect(summarizeConversationPrefix([])).toEqual(EMPTY_CONVERSATION_PREFIX)
  })
  it.each(Object.entries(conversationPrefixFixtures()))(
    '%s preserves every fact at every split',
    (_, items) => {
      const expected = fullFacts(items)
      const fullPrefix = summarizeConversationPrefix(items)
      for (let k = 0; k <= items.length; k++) {
        const prefix = summarizeConversationPrefix(items.slice(0, k))
        const window = items.slice(k)
        expect(
          combineConversationPrefix(prefix, window),
          `summary at ${k}`,
        ).toEqual(fullPrefix)
        expect(combineTurnStarts(prefix, window), `starts at ${k}`).toEqual(
          expected.starts,
        )
        expect(combineTurnOrdinals(prefix, window), `ordinals at ${k}`).toEqual(
          expected.ordinals,
        )
        expect(
          combineConversationDurationMs(prefix, window),
          `duration at ${k}`,
        ).toEqual(expected.duration)
        expect(
          combineLatestCompletedReplyId(prefix, window),
          `reply at ${k}`,
        ).toEqual(expected.reply)
      }
    },
  )
})
