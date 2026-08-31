import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '@/entities/session'
import {
  formatConversationTotalDuration,
  getConversationTotalDurationMs,
} from './conversation-total-duration.pure'

const baseItem = {
  id: 'item-1',
  sessionId: 'session-1',
  sequence: 1,
  state: 'complete' as const,
  providerMeta: {
    providerId: 'claude-code',
    providerItemId: null,
    providerEventType: null,
  },
}

function makeItem(
  overrides: Partial<ConversationItem> & {
    id: string
    turnId: string | null
    createdAt: string
    updatedAt: string
  },
): ConversationItem {
  return {
    ...baseItem,
    kind: 'message',
    actor: 'user',
    text: 'hi',
    ...overrides,
  } as ConversationItem
}

describe('getConversationTotalDurationMs', () => {
  it('returns null when no items have a turnId', () => {
    const items: ConversationItem[] = [
      makeItem({
        id: '1',
        turnId: null,
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:05.000Z',
      }),
    ]
    expect(getConversationTotalDurationMs(items)).toBeNull()
  })

  it('sums per-turn spans across multiple turns', () => {
    const items: ConversationItem[] = [
      // turn-a: 1m 50s
      makeItem({
        id: '1',
        turnId: 'turn-a',
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z',
      }),
      makeItem({
        id: '2',
        turnId: 'turn-a',
        createdAt: '2026-04-22T00:01:50.000Z',
        updatedAt: '2026-04-22T00:01:50.000Z',
      }),
      // turn-b: 2m 4s
      makeItem({
        id: '3',
        turnId: 'turn-b',
        createdAt: '2026-04-22T00:02:00.000Z',
        updatedAt: '2026-04-22T00:02:00.000Z',
      }),
      makeItem({
        id: '4',
        turnId: 'turn-b',
        createdAt: '2026-04-22T00:04:04.000Z',
        updatedAt: '2026-04-22T00:04:04.000Z',
      }),
    ]
    expect(getConversationTotalDurationMs(items)).toBe(110_000 + 124_000)
  })

  it('uses updatedAt as the turn end when later than any createdAt', () => {
    const items: ConversationItem[] = [
      makeItem({
        id: '1',
        turnId: 'turn-a',
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:30.000Z',
      }),
    ]
    expect(getConversationTotalDurationMs(items)).toBe(30_000)
  })

  it('ignores items with invalid timestamps', () => {
    const items: ConversationItem[] = [
      makeItem({
        id: '1',
        turnId: 'turn-a',
        createdAt: 'not-a-date',
        updatedAt: 'not-a-date',
      }),
      makeItem({
        id: '2',
        turnId: 'turn-a',
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:10.000Z',
      }),
    ]
    expect(getConversationTotalDurationMs(items)).toBe(10_000)
  })
})

describe('formatConversationTotalDuration', () => {
  it('formats sum of turn spans using formatDuration', () => {
    const items: ConversationItem[] = [
      makeItem({
        id: '1',
        turnId: 'turn-a',
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z',
      }),
      makeItem({
        id: '2',
        turnId: 'turn-a',
        createdAt: '2026-04-22T00:03:25.000Z',
        updatedAt: '2026-04-22T00:03:25.000Z',
      }),
    ]
    expect(formatConversationTotalDuration(items)).toBe('3m 25s')
  })

  it('returns null when total is below the 1s display threshold', () => {
    const items: ConversationItem[] = [
      makeItem({
        id: '1',
        turnId: 'turn-a',
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.500Z',
      }),
    ]
    expect(formatConversationTotalDuration(items)).toBeNull()
  })

  it('returns null when there are no turns', () => {
    expect(formatConversationTotalDuration([])).toBeNull()
  })
})
