import { describe, expect, it } from 'vitest'
import type { TranscriptEntry } from '../provider/provider.types'
import {
  buildConversationItemFromTranscriptEntry,
  conversationItemFromRow,
  conversationItemToInsertRow,
  migrateTranscriptToConversationItems,
} from './conversation-item.pure'

describe('conversation-item migration', () => {
  it('maps transcript entries to normalized conversation items', () => {
    const user: TranscriptEntry = {
      type: 'user',
      text: 'hello',
      timestamp: '2026-01-01T00:00:00.000Z',
      attachmentIds: ['att-1'],
    }
    const assistant: TranscriptEntry = {
      type: 'assistant',
      text: 'hi',
      timestamp: '2026-01-01T00:00:01.000Z',
    }
    const system: TranscriptEntry = {
      type: 'system',
      text: 'Error: boom',
      timestamp: '2026-01-01T00:00:02.000Z',
    }

    expect(
      buildConversationItemFromTranscriptEntry({
        id: 'item-1',
        sessionId: 'session-1',
        providerId: 'codex',
        sequence: 1,
        turnId: 'turn-1',
        entry: user,
      }),
    ).toMatchObject({
      kind: 'message',
      actor: 'user',
      text: 'hello',
      attachmentIds: ['att-1'],
      providerMeta: {
        providerId: 'codex',
        providerEventType: 'user',
      },
    })

    expect(
      buildConversationItemFromTranscriptEntry({
        id: 'item-2',
        sessionId: 'session-1',
        providerId: 'codex',
        sequence: 2,
        turnId: 'turn-1',
        entry: assistant,
      }),
    ).toMatchObject({
      kind: 'message',
      actor: 'assistant',
      text: 'hi',
      state: 'complete',
    })

    expect(
      buildConversationItemFromTranscriptEntry({
        id: 'item-3',
        sessionId: 'session-1',
        providerId: 'codex',
        sequence: 3,
        turnId: 'turn-1',
        entry: system,
      }),
    ).toMatchObject({
      kind: 'note',
      level: 'error',
      state: 'error',
      text: 'Error: boom',
    })
  })

  it('assigns deterministic turn ids while migrating legacy transcript blobs', () => {
    const items = migrateTranscriptToConversationItems({
      sessionId: 'session-1',
      providerId: 'claude-code',
      entries: [
        {
          type: 'system',
          text: 'Session started',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        {
          type: 'user',
          text: 'first',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
        {
          type: 'assistant',
          text: 'reply',
          timestamp: '2026-01-01T00:00:02.000Z',
        },
        {
          type: 'user',
          text: 'second',
          timestamp: '2026-01-01T00:00:03.000Z',
        },
      ],
    })

    expect(items.map((item) => item.turnId)).toEqual([
      null,
      'session-1:turn:1',
      'session-1:turn:1',
      'session-1:turn:2',
    ])
    expect(items.map((item) => item.id)).toEqual([
      'session-1:item:1',
      'session-1:item:2',
      'session-1:item:3',
      'session-1:item:4',
    ])
  })

  it('round-trips row serialization', () => {
    const item = buildConversationItemFromTranscriptEntry({
      id: 'item-1',
      sessionId: 'session-1',
      providerId: 'pi',
      sequence: 1,
      turnId: 'turn-1',
      entry: {
        type: 'tool-result',
        result: 'done',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    })

    const row = conversationItemToInsertRow(item)
    const roundTripped = conversationItemFromRow({
      id: row.id,
      session_id: row.sessionId,
      sequence: row.sequence,
      turn_id: row.turnId,
      kind: row.kind,
      state: row.state,
      payload_json: row.payloadJson,
      provider_item_id: row.providerItemId,
      provider_event_type: row.providerEventType,
      provider_id: 'pi',
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    })

    expect(roundTripped).toEqual(item)
  })
})
