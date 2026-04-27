import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '@/entities/session'
import {
  formatConversationItemAbsoluteTimestamp,
  formatConversationItemTimestamp,
  formatDuration,
  getConversationItemCopyText,
  getConversationItemTiming,
} from './transcript-entry.pure'

const base = {
  id: 'item-1',
  sessionId: 'session-1',
  sequence: 1,
  turnId: null,
  state: 'complete' as const,
  createdAt: '2026-04-22T00:00:00.000Z',
  updatedAt: '2026-04-22T00:00:00.000Z',
  providerMeta: {
    providerId: 'claude-code',
    providerItemId: null,
    providerEventType: null,
  },
}

describe('getConversationItemCopyText', () => {
  it('returns raw markdown text for assistant messages', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'message',
      actor: 'assistant',
      text: '# Heading\n\n- a\n- b',
    }
    expect(getConversationItemCopyText(item)).toBe('# Heading\n\n- a\n- b')
  })

  it('returns raw text for user messages', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'message',
      actor: 'user',
      text: 'hello world',
    }
    expect(getConversationItemCopyText(item)).toBe('hello world')
  })

  it('returns thinking text', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'thinking',
      actor: 'assistant',
      text: 'internal reasoning',
    }
    expect(getConversationItemCopyText(item)).toBe('internal reasoning')
  })

  it('returns inputText for tool-call', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'tool-call',
      toolName: 'Bash',
      inputText: '{"command":"ls"}',
    }
    expect(getConversationItemCopyText(item)).toBe('{"command":"ls"}')
  })

  it('returns outputText for tool-result', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'tool-result',
      toolName: null,
      relatedItemId: null,
      outputText: 'line 1\nline 2',
    }
    expect(getConversationItemCopyText(item)).toBe('line 1\nline 2')
  })

  it('returns description for approval-request', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'approval-request',
      description: 'Allow write?',
    }
    expect(getConversationItemCopyText(item)).toBe('Allow write?')
  })

  it('returns prompt for input-request', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'input-request',
      prompt: 'Enter name',
    }
    expect(getConversationItemCopyText(item)).toBe('Enter name')
  })

  it('returns text for note', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'note',
      level: 'info',
      text: 'Session resumed',
    }
    expect(getConversationItemCopyText(item)).toBe('Session resumed')
  })
})

describe('conversation item timing', () => {
  it('formats compact timestamps', () => {
    expect(
      formatConversationItemTimestamp('2026-04-22T10:05:06.000Z', {
        locale: 'en-GB',
        timeZone: 'UTC',
      }),
    ).toBe('10:05:06')
  })

  it('formats absolute timestamps for tooltips', () => {
    expect(
      formatConversationItemAbsoluteTimestamp('2026-04-22T10:05:06.000Z', {
        locale: 'en-GB',
        timeZone: 'UTC',
      }),
    ).toBe('22 Apr 2026, 10:05:06')
  })

  it('formats readable durations', () => {
    expect(formatDuration(900)).toBe('<1s')
    expect(formatDuration(12_000)).toBe('12s')
    expect(formatDuration(125_000)).toBe('2m 5s')
    expect(formatDuration(7_200_000)).toBe('2h')
  })

  it('reports turn elapsed time and active duration for assistant work', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'message',
      actor: 'assistant',
      text: 'done',
      createdAt: '2026-04-22T00:00:03.000Z',
      updatedAt: '2026-04-22T00:00:08.000Z',
    }

    expect(
      getConversationItemTiming(item, '2026-04-22T00:00:00.000Z', {
        locale: 'en-GB',
        timeZone: 'UTC',
      }),
    ).toMatchObject({
      startedAtLabel: '00:00:03',
      turnElapsedLabel: '+3s',
      activeDurationLabel: '5s',
    })
  })

  it('does not treat user message metadata patches as work duration', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'message',
      actor: 'user',
      text: 'start',
      createdAt: '2026-04-22T00:00:00.000Z',
      updatedAt: '2026-04-22T00:01:00.000Z',
    }

    expect(
      getConversationItemTiming(item, '2026-04-22T00:00:00.000Z'),
    ).toMatchObject({
      turnElapsedLabel: null,
      activeDurationLabel: null,
    })
  })
})
