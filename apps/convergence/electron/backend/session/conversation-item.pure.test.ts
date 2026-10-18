import { describe, expect, it } from 'vitest'
import type { TranscriptEntry } from '../provider/provider.types'
import type { ConversationItem } from './conversation-item.types'
import {
  addToolAttachmentOmissions,
  buildConversationItemFromTranscriptEntry,
  conversationItemFromRow,
  conversationItemToInsertRow,
  migrateTranscriptToConversationItems,
  readToolAttachmentOmissions,
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

  it('round-trips selected skill metadata on user messages', () => {
    const item: ConversationItem = {
      id: 'item-1',
      sessionId: 'session-1',
      sequence: 1,
      turnId: 'turn-1',
      kind: 'message',
      state: 'complete',
      actor: 'user',
      text: 'Use the planning skill.',
      skillSelections: [
        {
          id: 'antigravity:global:planning',
          providerId: 'antigravity',
          providerName: 'Antigravity CLI',
          name: 'planning',
          displayName: 'Planning',
          path: '/skills/planning/SKILL.md',
          scope: 'global',
          rawScope: null,
          sourceLabel: 'Global',
          status: 'selected',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      providerMeta: {
        providerId: 'antigravity',
        providerItemId: null,
        providerEventType: 'user',
      },
    }

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
      provider_id: 'antigravity',
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    })

    expect(roundTripped).toEqual(item)
  })

  describe('note actions survive storage', () => {
    function noteRow(action: unknown) {
      const item = conversationItemToInsertRow({
        id: 'note-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: 'turn-1',
        kind: 'note',
        state: 'complete',
        level: 'warning',
        text: 'linear is not authorized',
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
        providerMeta: { providerItemId: null, providerEventType: 'mcp_auth' },
        ...(action === undefined ? {} : { action }),
      } as never)

      return conversationItemFromRow({
        id: item.id,
        session_id: item.sessionId,
        sequence: item.sequence,
        turn_id: item.turnId,
        kind: item.kind,
        state: item.state,
        payload_json: item.payloadJson,
        provider_item_id: item.providerItemId,
        provider_event_type: item.providerEventType,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      } as never)
    }

    it('round-trips an authorize action', () => {
      // The note outlives the turn; the control has to outlive a restart too.
      const item = noteRow({
        kind: 'authorize-mcp-server',
        serverName: 'linear',
        providerAccountId: 'acct-a',
      })

      expect(item.kind === 'note' && item.action).toEqual({
        kind: 'authorize-mcp-server',
        serverName: 'linear',
        providerAccountId: 'acct-a',
      })
    })

    it('drops an action it does not understand rather than offering it', () => {
      // A note written by another release must render as an ordinary note, not
      // as a control this build cannot honour.
      expect(
        noteRow({ kind: 'do-something-else', serverName: 'linear' }),
      ).not.toHaveProperty('action')
      expect(noteRow({ kind: 'authorize-mcp-server' })).not.toHaveProperty(
        'action',
      )
      expect(noteRow('nonsense')).not.toHaveProperty('action')
      expect(noteRow(undefined)).not.toHaveProperty('action')
    })
  })

  describe('tool-result images survive storage', () => {
    function toolResult(extra: Record<string, unknown> = {}): ConversationItem {
      return {
        id: 'tool-1',
        sessionId: 'session-1',
        sequence: 1,
        turnId: 'turn-1',
        kind: 'tool-result',
        state: 'complete',
        toolName: 'Read',
        relatedItemId: 'call-1',
        outputText: 'read the image',
        createdAt: '2026-10-18T00:00:00.000Z',
        updatedAt: '2026-10-18T00:00:00.000Z',
        providerMeta: {
          providerId: 'claude-code',
          providerItemId: null,
          providerEventType: 'tool_result',
        },
        ...extra,
      } as ConversationItem
    }

    function fromPayload(payloadJson: string): ConversationItem {
      const row = conversationItemToInsertRow(toolResult())
      return conversationItemFromRow({
        id: row.id,
        session_id: row.sessionId,
        sequence: row.sequence,
        turn_id: row.turnId,
        kind: row.kind,
        state: row.state,
        payload_json: payloadJson,
        provider_item_id: row.providerItemId,
        provider_event_type: row.providerEventType,
        provider_id: 'claude-code',
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      })
    }

    function roundTrip(item: ConversationItem): ConversationItem {
      return fromPayload(conversationItemToInsertRow(item).payloadJson)
    }

    it('round-trips attachment ids and omission counts', () => {
      const item = toolResult({
        attachmentIds: ['att-1', 'att-2'],
        attachmentOmissions: { 'image-too-large': 1, 'turn-limit': 3 },
      })

      expect(roundTrip(item)).toEqual(item)
    })

    it('reads back a tool result with neither without the keys', () => {
      const read = roundTrip(toolResult())

      expect(read).toEqual(toolResult())
      expect(read).not.toHaveProperty('attachmentIds')
      expect(read).not.toHaveProperty('attachmentOmissions')
    })

    it('drops what it cannot read from a stored payload', () => {
      const read = fromPayload(
        JSON.stringify({
          toolName: 'Read',
          relatedItemId: 'call-1',
          outputText: 'read the image',
          attachmentIds: ['att-1', 7, null, { id: 'att-2' }, 'att-3'],
          attachmentOmissions: {
            'image-too-large': 2,
            'made-up-code': 4,
            'turn-limit': -1,
            'invalid-image': 1.5,
            'storage-failed': '2',
            'download-failed': 0,
          },
        }),
      )

      expect(read).toMatchObject({
        attachmentIds: ['att-1', 'att-3'],
        attachmentOmissions: { 'image-too-large': 2 },
      })
      expect(
        read.kind === 'tool-result' && read.attachmentOmissions,
      ).toStrictEqual({ 'image-too-large': 2 })
    })

    it('reads junk alone as no attachments at all, not empty ones', () => {
      for (const junk of [
        { attachmentIds: 'att-1', attachmentOmissions: [1, 2] },
        { attachmentIds: { 0: 'att-1' }, attachmentOmissions: 'lots' },
        { attachmentIds: [1, false], attachmentOmissions: { nope: 1 } },
        { attachmentIds: [], attachmentOmissions: {} },
        { attachmentIds: null, attachmentOmissions: null },
        {
          attachmentIds: [null],
          attachmentOmissions: { 'turn-limit': -2, 'invalid-image': 0.5 },
        },
      ]) {
        const read = fromPayload(
          JSON.stringify({
            toolName: 'Read',
            relatedItemId: 'call-1',
            outputText: 'read the image',
            ...junk,
          }),
        )

        expect(read).not.toHaveProperty('attachmentIds')
        expect(read).not.toHaveProperty('attachmentOmissions')
      }
    })
  })

  describe('readToolAttachmentOmissions', () => {
    it('is absent for anything that is not a record of counts', () => {
      expect(readToolAttachmentOmissions(null)).toBeUndefined()
      expect(readToolAttachmentOmissions(undefined)).toBeUndefined()
      expect(readToolAttachmentOmissions([3])).toBeUndefined()
      expect(readToolAttachmentOmissions('turn-limit')).toBeUndefined()
      expect(readToolAttachmentOmissions(4)).toBeUndefined()
      expect(readToolAttachmentOmissions({})).toBeUndefined()
    })

    it('keeps only known codes with a positive whole count', () => {
      expect(
        readToolAttachmentOmissions({
          'unsupported-mime-type': 1,
          'session-limit': 5,
          'download-failed': 2,
          'image-too-large': 0,
          'turn-limit': Number.NaN,
          'invalid-image': Number.POSITIVE_INFINITY,
          'storage-failed': 2.5,
          other: 9,
        }),
      ).toStrictEqual({
        'unsupported-mime-type': 1,
        'session-limit': 5,
        'download-failed': 2,
      })
    })
  })

  describe('addToolAttachmentOmissions', () => {
    it('adds the counts code by code', () => {
      expect(
        addToolAttachmentOmissions(
          { 'turn-limit': 2, 'invalid-image': 1 },
          { 'turn-limit': 1, 'download-failed': 4 },
        ),
      ).toStrictEqual({
        'invalid-image': 1,
        'turn-limit': 3,
        'download-failed': 4,
      })
    })

    it('keeps one side when the other is absent', () => {
      expect(
        addToolAttachmentOmissions(undefined, { 'storage-failed': 1 }),
      ).toStrictEqual({ 'storage-failed': 1 })
      expect(
        addToolAttachmentOmissions({ 'image-too-large': 2 }, undefined),
      ).toStrictEqual({ 'image-too-large': 2 })
    })

    it('is absent when both sides are empty', () => {
      expect(addToolAttachmentOmissions(undefined, undefined)).toBeUndefined()
      expect(addToolAttachmentOmissions({}, {})).toBeUndefined()
      expect(addToolAttachmentOmissions({}, undefined)).toBeUndefined()
    })
  })
})
