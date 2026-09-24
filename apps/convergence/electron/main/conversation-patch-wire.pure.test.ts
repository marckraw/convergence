import { serialize } from 'node:v8'
import { describe, expect, it } from 'vitest'
import type {
  ConversationItem,
  ConversationPatchEvent,
} from '../backend/session/conversation-item.types'
import {
  conversationPatchWire,
  nextWireMemory,
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

function wireStream() {
  let memory: ConversationWireMemory = new Map()
  return {
    get memory() {
      return memory
    },
    send(event: ConversationPatchEvent) {
      const result = nextWireMemory(memory, event)
      memory = result.memory
      return result.wire
    },
  }
}

describe('MAR-3380 main wire adapter', () => {
  it('R3 releases only the changed item and preserves the previous memory', () => {
    const a = message('one')
    const b = { ...message('two'), id: 'other-item' }
    const c = { ...message('three'), sessionId: 'other-session' }
    const first = nextWireMemory(new Map(), patch(a)).memory
    const second = nextWireMemory(first, patch(b)).memory
    const third = nextWireMemory(second, patch(c)).memory
    const released = nextWireMemory(
      third,
      patch({ ...a, state: 'complete' }),
    ).memory
    expect(first.get('session')?.size).toBe(1)
    expect(third.get('session')?.size).toBe(2)
    expect(released.get('session')?.has(a.id)).toBe(false)
    expect(released.get('session')?.get(b.id)).toBe(b)
    expect(released.get('other-session')?.get(c.id)).toBe(c)
  })
  it('R1/R6 sends at most 10% of full-stream bytes and a full terminal item', () => {
    const stream = wireStream()
    let before = 0
    let after = 0
    for (let i = 1; i <= 200; i++) {
      const event = patch(message('x'.repeat(i * 100)))
      before += serialize(event).byteLength
      after += serialize(stream.send(event)).byteLength
    }
    const terminal = patch({
      ...message('x'.repeat(20_000)),
      state: 'complete',
    })
    const terminalWire = stream.send(terminal)
    before += serialize(terminal).byteLength
    after += serialize(terminalWire).byteLength
    console.info(
      `MAR-3380 R6 V8 bytes: full=${before}, wire=${after}, ratio=${after / before}`,
    )
    expect(after).toBeLessThanOrEqual(before * 0.1)
    expect(terminalWire).toEqual(terminal)
    expect(stream.memory.size).toBe(0)
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
    const stream = wireStream()
    const item = {
      ...message('think'),
      kind: 'thinking' as const,
      actor: 'assistant' as const,
    }
    expect(stream.send({ ...patch(item), op: 'add' }).op).toBe('add')
    expect(stream.send(patch({ ...item, text: 'thinking' }))).toEqual({
      op: 'append',
      sessionId: 'session',
      itemId: 'item',
      baseLength: 5,
      append: 'ing',
      updatedAt: item.updatedAt,
    })
    stream.send(patch({ ...item, text: 'restated' }))
    expect(stream.memory.size).toBe(0)
    expect(stream.send(patch({ ...item, text: 'restated again' })).op).toBe(
      'patch',
    )
  })

  it('R1 remembers a full non-text patch so the next text growth is an append', () => {
    const stream = wireStream()
    const added = message('hi')
    expect(stream.send({ ...patch(added), op: 'add' }).op).toBe('add')
    const withTask = patch({ ...added, taskId: 'task' })
    expect(stream.send(withTask)).toEqual(withTask)
    expect(
      stream.send(patch({ ...added, taskId: 'task', text: 'hi there' })),
    ).toEqual({
      op: 'append',
      sessionId: 'session',
      itemId: 'item',
      baseLength: 2,
      append: ' there',
      updatedAt: added.updatedAt,
    })
  })

  it('R2 treats a missing key and undefined as the same fact', () => {
    const stream = wireStream()
    const added = message('hi')
    expect(stream.send({ ...patch(added), op: 'add' }).op).toBe('add')
    expect(
      stream.send(
        patch({
          ...added,
          text: 'hi there',
          attachmentIds: undefined,
          skillSelections: undefined,
        }),
      ),
    ).toEqual({
      op: 'append',
      sessionId: 'session',
      itemId: 'item',
      baseLength: 2,
      append: ' there',
      updatedAt: added.updatedAt,
    })
    const nulled = {
      ...added,
      text: 'hi there!',
      attachmentIds: null,
    } as unknown as Extract<ConversationItem, { kind: 'message' }>
    expect(stream.send(patch(nulled)).op).toBe('patch')
  })
})
