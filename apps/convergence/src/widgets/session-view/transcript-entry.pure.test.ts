import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '@/entities/session'
import {
  buildTranscriptEntryViewModel,
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
        now: '2026-04-22T12:00:00.000Z',
      }),
    ).toBe('Today, 10:05:06')
    expect(
      formatConversationItemTimestamp('2026-04-21T10:05:06.000Z', {
        locale: 'en-GB',
        timeZone: 'UTC',
        now: '2026-04-22T12:00:00.000Z',
      }),
    ).toBe('Yesterday, 10:05:06')
    expect(
      formatConversationItemTimestamp('2026-04-20T10:05:06.000Z', {
        locale: 'en-GB',
        timeZone: 'UTC',
        now: '2026-04-22T12:00:00.000Z',
      }),
    ).toBe('20 Apr 2026, 10:05:06')
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
        now: '2026-04-22T12:00:00.000Z',
      }),
    ).toMatchObject({
      startedAtLabel: 'Today, 00:00:03',
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

describe('buildTranscriptEntryViewModel', () => {
  it('derives render facts for a user follow-up with resolved and missing attachments', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'message',
      actor: 'user',
      text: 'review these',
      attachmentIds: ['att-1', 'missing-1'],
      deliveryMode: 'follow-up',
    }
    const attachment = {
      id: 'att-1',
      sessionId: 'session-1',
      kind: 'image' as const,
      mimeType: 'image/png',
      filename: 'screen.png',
      sizeBytes: 1,
      storagePath: '/tmp/screen.png',
      thumbnailPath: null,
      textPreview: null,
      createdAt: '2026-04-22T00:00:00.000Z',
    }

    expect(
      buildTranscriptEntryViewModel({
        item,
        resolvedAttachmentsById: { 'att-1': attachment },
      }),
    ).toMatchObject({
      kind: 'user-message',
      label: 'You',
      copyText: 'review these',
      deliveryModeLabel: 'Follow-up',
      attachments: [attachment],
      missingAttachmentIds: ['missing-1'],
    })
  })

  it('marks approval actions only when the current approval is actionable', () => {
    const item: ConversationItem = {
      ...base,
      kind: 'approval-request',
      description: 'Allow command?',
    }

    expect(
      buildTranscriptEntryViewModel({ item, actionableApproval: false }),
    ).toMatchObject({
      kind: 'approval-request',
      label: 'Approval needed',
      actionableApproval: false,
    })
    expect(
      buildTranscriptEntryViewModel({ item, actionableApproval: true }),
    ).toMatchObject({
      actionableApproval: true,
    })
  })

  it('derives truncated tool previews without changing copy text', () => {
    const outputText = `${'x'.repeat(150)}\nsecond line`
    const item: ConversationItem = {
      ...base,
      kind: 'tool-result',
      toolName: null,
      relatedItemId: null,
      outputText,
    }

    const model = buildTranscriptEntryViewModel({ item })

    expect(model.kind).toBe('tool-result')
    expect(model.copyText).toBe(outputText)
    expect(model.toolPreview).toHaveLength(120)
    expect(model.toolPreview?.endsWith('...')).toBe(true)
  })
})
