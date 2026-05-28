import { describe, expect, it, vi } from 'vitest'
import type { ConversationItem } from '../session/conversation-item.types'
import { ProviderSessionEmitter } from './provider-session.emitter'

type ThinkingItem = Extract<ConversationItem, { kind: 'thinking' }>

function makeEmitter() {
  const emitDelta = vi.fn()
  const emitter = new ProviderSessionEmitter({
    providerId: 'codex',
    emitDelta,
    now: () => '2026-05-28T07:00:00.000Z',
  })
  return { emitter, emitDelta }
}

describe('ProviderSessionEmitter thinking patches', () => {
  it('emits only mutable thinking fields', () => {
    const { emitter, emitDelta } = makeEmitter()

    emitter.patchThinking('thinking-1', {
      text: 'still thinking',
      state: 'streaming',
    })

    expect(emitDelta).toHaveBeenCalledWith({
      kind: 'conversation.item.patch',
      itemId: 'thinking-1',
      patch: {
        text: 'still thinking',
        state: 'streaming',
        updatedAt: '2026-05-28T07:00:00.000Z',
      },
    })
  })

  it('preserves explicit thinking patch timestamps', () => {
    const { emitter, emitDelta } = makeEmitter()

    emitter.patchThinking('thinking-1', {
      text: 'done thinking',
      state: 'complete',
      updatedAt: '2026-05-28T07:01:00.000Z',
    })

    expect(emitDelta).toHaveBeenCalledWith({
      kind: 'conversation.item.patch',
      itemId: 'thinking-1',
      patch: {
        text: 'done thinking',
        state: 'complete',
        updatedAt: '2026-05-28T07:01:00.000Z',
      },
    })
  })

  it('filters immutable thinking fields from unsafe runtime callers', () => {
    const { emitter, emitDelta } = makeEmitter()
    const unsafePatchThinking = emitter.patchThinking.bind(
      emitter,
    ) as unknown as (itemId: string, patch: Record<string, unknown>) => void

    unsafePatchThinking('thinking-1', {
      text: 'filtered',
      kind: 'message',
      createdAt: '2026-05-28T06:59:00.000Z',
      providerMeta: {
        providerId: 'claude-code',
        providerItemId: 'provider-item',
        providerEventType: 'thinking_delta',
      },
    })

    expect(emitDelta).toHaveBeenCalledWith({
      kind: 'conversation.item.patch',
      itemId: 'thinking-1',
      patch: {
        text: 'filtered',
        updatedAt: '2026-05-28T07:00:00.000Z',
      },
    })
  })

  it('rejects immutable thinking fields at the type boundary', () => {
    const { emitter } = makeEmitter()
    const broadPatch: Partial<ThinkingItem> = {
      kind: 'thinking',
      text: 'too broad',
    }

    emitter.patchThinking('thinking-1', { text: 'allowed' })
    // @ts-expect-error thinking kind is immutable after creation
    emitter.patchThinking('thinking-1', { kind: 'thinking' })
    emitter.patchThinking('thinking-1', {
      // @ts-expect-error provider metadata is immutable after creation
      providerMeta: {
        providerId: 'codex',
        providerItemId: 'provider-item',
        providerEventType: 'reasoning',
      },
    })
    // @ts-expect-error broad ThinkingItem patches can include immutable fields
    emitter.patchThinking('thinking-1', broadPatch)
  })
})
