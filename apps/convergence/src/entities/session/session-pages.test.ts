import { beforeEach, expect, it, vi } from 'vitest'
import {
  resetConversationLoadsForTests,
  useSessionStore,
} from './session.model'
import { EMPTY_CONVERSATION_PREFIX } from './conversation-prefix.pure'
import {
  liveConversationItem,
  resetLiveConversationTextForTests,
} from './conversation-live-text.model'
import type { ConversationItem } from './session.types'

const resync = vi.fn().mockResolvedValue(undefined)
const item = (sequence: number): ConversationItem => ({
  id: `item-${sequence}`,
  sessionId: 's',
  sequence,
  turnId: 't',
  kind: 'message',
  actor: 'assistant',
  state: 'streaming',
  text: 'one',
  createdAt: 'at',
  updatedAt: 'at',
  providerMeta: {
    providerId: 'fake',
    providerItemId: null,
    providerEventType: null,
  },
})
const store = () => useSessionStore.getState()
const emit = (
  event: Parameters<ReturnType<typeof store>['handleConversationPatched']>[0],
) => store().handleConversationPatched(event)
beforeEach(() => {
  resetConversationLoadsForTests()
  resetLiveConversationTextForTests()
  resync.mockClear()
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { session: { resyncConversation: resync } },
  })
  useSessionStore.setState(useSessionStore.getInitialState())
})
for (const global of [false, true]) {
  const items = () =>
    global ? store().activeGlobalConversation : store().activeConversation
  const windowState = () =>
    global
      ? store().activeGlobalConversationWindow
      : store().activeConversationWindow
  async function open() {
    useSessionStore.setState(
      global ? { activeGlobalSessionId: 's' } : { activeSessionId: 's' },
    )
    await store().loadActiveConversation('s')
    const pageNonce = resync.mock.lastCall![2]
    emit({
      op: 'snapshot',
      sessionId: 's',
      items: [item(1001), item(1002)],
      prefix: EMPTY_CONVERSATION_PREFIX,
      hasOlder: true,
      oldestSequence: 1001,
      generation: 1,
      pageNonce,
    })
    return pageNonce
  }
  it(`R2 ${global ? 'global' : 'project'} prepends and preserves live text and the next append`, async () => {
    const pageNonce = await open()
    const current = items()
    emit({
      op: 'append',
      sessionId: 's',
      itemId: 'item-1002',
      baseLength: 3,
      append: ' two',
      updatedAt: 'at',
    })
    await store().loadOlderConversation('s')
    expect(resync.mock.lastCall).toEqual([
      's',
      1,
      pageNonce,
      { limit: 300, beforeSequence: 1001 },
    ])
    const prefix = { ...EMPTY_CONVERSATION_PREFIX, turnCount: 4 }
    emit({
      op: 'older-page',
      sessionId: 's',
      items: [item(701), item(1001)],
      prefix,
      hasOlder: true,
      oldestSequence: 701,
      beforeSequence: 1001,
      generation: 1,
      pageNonce,
    })
    expect(items().map((item) => item.sequence)).toEqual([701, 1001, 1002])
    expect(items()[1]).toBe(current[0])
    expect(items()[2]).toBe(current[1])
    expect(liveConversationItem(items()[2])).toMatchObject({ text: 'one two' })
    emit({
      op: 'append',
      sessionId: 's',
      itemId: 'item-1002',
      baseLength: 7,
      append: ' three',
      updatedAt: 'at',
    })
    expect(liveConversationItem(items()[2])).toMatchObject({
      text: 'one two three',
    })
    expect(resync).toHaveBeenCalledTimes(2)
    expect(
      global
        ? store().activeGlobalConversationPrefix
        : store().activeConversationPrefix,
    ).toBe(prefix)
    expect(windowState()).toEqual({
      snapshotVersion: 1,
      hasOlder: true,
      oldestSequence: 701,
      loading: false,
    })
  })
  it(`R2/R3 ${global ? 'global' : 'project'} ignores old add/patch and stale pages by nonce, generation and boundary`, async () => {
    const pageNonce = await open()
    const current = items()
    emit({ op: 'add', sessionId: 's', item: item(1) })
    emit({ op: 'patch', sessionId: 's', item: item(2) })
    expect(items()).toBe(current)
    await store().loadOlderConversation('s')
    const event = {
      op: 'older-page' as const,
      sessionId: 's',
      items: [item(701)],
      prefix: EMPTY_CONVERSATION_PREFIX,
      hasOlder: true,
      oldestSequence: 701,
      beforeSequence: 1001,
      generation: 1,
      pageNonce,
    }
    emit({ ...event, pageNonce: 'old-renderer' })
    emit({ ...event, generation: 0 })
    emit({ ...event, beforeSequence: 99 })
    expect(items()).toBe(current)
    await store().loadActiveConversation('s')
    emit({
      op: 'snapshot',
      sessionId: 's',
      items: [item(2001)],
      prefix: EMPTY_CONVERSATION_PREFIX,
      hasOlder: true,
      oldestSequence: 2001,
      generation: 2,
      pageNonce,
    })
    const replaced = items()
    emit(event)
    expect(items()).toBe(replaced)
  })
  it(`R13 ${global ? 'global' : 'project'} snapshot clears in-flight and failed older loads so the next scroll-up reads`, async () => {
    const pageNonce = await open()
    await store().loadOlderConversation('s')
    const snapshot = {
      op: 'snapshot' as const,
      sessionId: 's',
      items: [item(1001)],
      prefix: EMPTY_CONVERSATION_PREFIX,
      hasOlder: true,
      oldestSequence: 1001,
      generation: 1,
      pageNonce,
    }
    emit(snapshot)
    await store().loadOlderConversation('s')
    expect(resync).toHaveBeenCalledTimes(3)
    emit(snapshot)
    resync.mockRejectedValueOnce(new Error('older failed'))
    await store().loadOlderConversation('s')
    expect(windowState().error).toBe('older failed')
    emit(snapshot)
    await store().loadOlderConversation('s')
    expect(resync).toHaveBeenCalledTimes(5)
    expect(windowState()).toMatchObject({ loading: true })
    expect(windowState().error).toBeUndefined()
  })
}
