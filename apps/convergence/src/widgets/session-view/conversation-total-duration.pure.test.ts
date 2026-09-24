import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '@/entities/session'
import {
  extendConversationTotalMs,
  formatConversationDurationMs,
  formatConversationTotalDuration,
  getConversationTotalDurationMs,
  readStreamingDurationTarget,
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

const T0 = '2026-04-22T00:00:00.000Z'
const T1 = '2026-04-22T00:00:10.000Z'
const T_LAST = '2026-04-22T00:03:10.000Z'

describe('extendConversationTotalMs', () => {
  function streamingTurn(createdAt: string, updatedAt: string) {
    return [
      makeItem({
        id: 'user',
        turnId: 'turn-a',
        createdAt: T0,
        updatedAt: T0,
        kind: 'message',
        actor: 'user',
      }),
      makeItem({
        id: 'reply',
        turnId: 'turn-a',
        createdAt,
        updatedAt,
        kind: 'message',
        actor: 'assistant',
        state: 'streaming',
      }),
    ]
  }

  it('adds only the live time past the turn end', () => {
    const target = readStreamingDurationTarget(streamingTurn(T1, T1))
    expect(target.streamingItem?.id).toBe('reply')
    expect(
      extendConversationTotalMs(target.totalMs, target.turnSpan, T_LAST),
    ).toBe(190_000)
    expect(
      formatConversationDurationMs(
        extendConversationTotalMs(target.totalMs, target.turnSpan, T_LAST),
      ),
    ).toBe('3m 10s')
  })

  it('leaves the base untouched when the live time is not later', () => {
    const target = readStreamingDurationTarget(streamingTurn(T1, T1))
    expect(extendConversationTotalMs(target.totalMs, target.turnSpan, T1)).toBe(
      10_000,
    )
    expect(extendConversationTotalMs(target.totalMs, null, T_LAST)).toBe(10_000)
  })

  it('a first turn under 1s stays hidden until the live extension passes 1s', () => {
    const createdAt = '2026-04-22T00:00:00.400Z'
    const target = readStreamingDurationTarget(
      streamingTurn(createdAt, createdAt),
    )
    expect(
      formatConversationDurationMs(
        extendConversationTotalMs(
          target.totalMs,
          target.turnSpan,
          '2026-04-22T00:00:00.900Z',
        ),
      ),
    ).toBeNull()
    expect(
      formatConversationDurationMs(
        extendConversationTotalMs(
          target.totalMs,
          target.turnSpan,
          '2026-04-22T00:00:01.100Z',
        ),
      ),
    ).toBe('1s')
  })

  it('a completion patch equals the live extension at the last append', () => {
    const streaming = streamingTurn(T1, T1)
    const target = readStreamingDurationTarget(streaming)
    const liveMs = extendConversationTotalMs(
      target.totalMs,
      target.turnSpan,
      T_LAST,
    )
    const completed = streaming.map((item) =>
      item.id === 'reply'
        ? { ...item, state: 'complete' as const, updatedAt: T_LAST }
        : item,
    )
    expect(getConversationTotalDurationMs(completed)).toBe(liveMs)
    expect(formatConversationTotalDuration(completed)).toBe(
      formatConversationDurationMs(liveMs),
    )
  })
})
