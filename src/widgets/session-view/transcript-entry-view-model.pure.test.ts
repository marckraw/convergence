import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '@/entities/session'
import {
  buildTranscriptEntryViewModel,
  formatConversationItemAbsoluteTimestamp,
  formatConversationItemTimestamp,
  formatDuration,
  getConversationItemCopyText,
  getConversationItemTiming,
} from './transcript-entry-view-model.pure'

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
  it('returns raw text for each normalized conversation item kind', () => {
    const items: ConversationItem[] = [
      {
        ...base,
        kind: 'message',
        actor: 'assistant',
        text: '# Heading',
      },
      {
        ...base,
        kind: 'thinking',
        actor: 'assistant',
        text: 'thinking',
      },
      {
        ...base,
        kind: 'tool-call',
        toolName: 'Bash',
        inputText: '{"command":"ls"}',
      },
      {
        ...base,
        kind: 'tool-result',
        toolName: null,
        relatedItemId: null,
        outputText: 'line 1',
      },
      {
        ...base,
        kind: 'approval-request',
        description: 'Allow write?',
      },
      {
        ...base,
        kind: 'input-request',
        prompt: 'Enter name',
      },
      {
        ...base,
        kind: 'note',
        level: 'info',
        text: 'Session resumed',
      },
    ]

    expect(items.map(getConversationItemCopyText)).toEqual([
      '# Heading',
      'thinking',
      '{"command":"ls"}',
      'line 1',
      'Allow write?',
      'Enter name',
      'Session resumed',
    ])
  })
})

describe('conversation item timing', () => {
  it('formats timestamps and durations', () => {
    expect(
      formatConversationItemTimestamp('2026-04-22T10:05:06.000Z', {
        locale: 'en-GB',
        timeZone: 'UTC',
      }),
    ).toBe('10:05:06')
    expect(
      formatConversationItemAbsoluteTimestamp('2026-04-22T10:05:06.000Z', {
        locale: 'en-GB',
        timeZone: 'UTC',
      }),
    ).toBe('22 Apr 2026, 10:05:06')
    expect(formatDuration(125_000)).toBe('2m 5s')
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
