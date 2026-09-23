import { serialize } from 'node:v8'
import { describe, expect, it } from 'vitest'
import type {
  ConversationItem,
  ConversationPatchEvent,
} from '../backend/session/conversation-item.types'
import {
  conversationPatchWire,
  type ConversationWireMemory,
} from './conversation-patch-wire.pure'

function message(text: string): Extract<ConversationItem, { kind: 'message' }> {
  return {
    id: 'item',
    sessionId: 'session',
    sequence: 1,
    turnId: 'turn',
    kind: 'message',
    state: 'streaming',
    actor: 'assistant',
    text,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
    providerMeta: {
      providerId: 'fake',
      providerItemId: 'item',
      providerEventType: 'message',
    },
  }
}
function patch(item: ConversationItem): ConversationPatchEvent {
  return { sessionId: item.sessionId, op: 'patch', item }
}

function rememberConversationPatch(
  memory: ConversationWireMemory,
  event: ConversationPatchEvent,
) {
  const items = memory.get(event.sessionId) ?? new Map()
  const result = conversationPatchWire(items.get(event.item.id), event)
  if (result.remember) items.set(event.item.id, result.remember)
  else items.delete(event.item.id)
  if (items.size) memory.set(event.sessionId, items)
  else memory.delete(event.sessionId)
  return result.wire
}

describe('MAR-3380 main wire adapter', () => {
  it('R1/R6 sends at most 10% of full-stream bytes and a full terminal item', () => {
    const memory: ConversationWireMemory = new Map()
    let before = 0
    let after = 0
    for (let i = 1; i <= 200; i++) {
      const event = patch(message('x'.repeat(i * 100)))
      before += serialize(event).byteLength
      after += serialize(rememberConversationPatch(memory, event)).byteLength
    }
    const terminal = patch({
      ...message('x'.repeat(20_000)),
      state: 'complete',
    })
    const terminalWire = rememberConversationPatch(memory, terminal)
    before += serialize(terminal).byteLength
    after += serialize(terminalWire).byteLength
    console.info(
      `MAR-3380 R6 V8 bytes: full=${before}, wire=${after}, ratio=${after / before}`,
    )
    expect(after).toBeLessThanOrEqual(before * 0.1)
    expect(terminalWire).toEqual(terminal)
    expect(memory.size).toBe(0)
  })

  it('R3 keeps adds, structural changes, non-prefix restatements and evidence full', () => {
    const previous = message('hello')
    const variants: ConversationPatchEvent[] = [
      { ...patch(message('hello world')), op: 'add' },
      patch({ ...previous, kind: 'note', level: 'info', text: 'note' }),
      patch(message('different words')),
      patch({ ...message('hello world'), taskId: 'new-task' }),
      patch({ ...message('hello world'), agentRunId: 'new-run' }),
      patch({
        ...message('hello world'),
        agentAttribution: { description: 'new', agentType: null },
      }),
      patch({ ...message('hello world'), sequence: 2 }),
      patch({ ...message('hello world'), state: 'error' }),
      patch({
        ...previous,
        kind: 'approval-request',
        description: 'permission',
        resolution: 'approved',
      }),
      patch({
        ...previous,
        kind: 'thinking',
        actor: 'assistant',
        text: 'hello thoughts',
      }),
    ]
    for (const event of variants) {
      const result = conversationPatchWire(previous, event)
      expect(result.wire).toEqual(event)
      if (event.op !== 'add') expect(result.remember).toBeUndefined()
    }
  })

  it('R3 remembers streaming adds, appends thinking, and forgets non-prefix restatements', () => {
    const memory: ConversationWireMemory = new Map()
    const item = {
      ...message('think'),
      kind: 'thinking' as const,
      actor: 'assistant' as const,
    }
    expect(
      rememberConversationPatch(memory, { ...patch(item), op: 'add' }).op,
    ).toBe('add')
    expect(
      rememberConversationPatch(memory, patch({ ...item, text: 'thinking' })),
    ).toEqual({
      op: 'append',
      sessionId: 'session',
      itemId: 'item',
      baseLength: 5,
      append: 'ing',
      updatedAt: item.updatedAt,
    })
    rememberConversationPatch(memory, patch({ ...item, text: 'restated' }))
    expect(memory.size).toBe(0)
    expect(
      rememberConversationPatch(
        memory,
        patch({ ...item, text: 'restated again' }),
      ).op,
    ).toBe('patch')
  })
})
