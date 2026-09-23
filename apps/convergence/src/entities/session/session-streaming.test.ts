import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from './session.model'
import type { ConversationItem } from './session.types'
import type { ConversationWireEvent } from '@/shared/types/conversation-item.types'

const getConversation = vi.fn()
const resyncConversation = vi.fn().mockResolvedValue(undefined)
let sessionId: string
let serial = 0
beforeEach(() => {
  vi.clearAllMocks()
  sessionId = `stream-${++serial}`
  Object.defineProperty(globalThis, 'window', {
    value: {
      electronAPI: { session: { getConversation, resyncConversation } },
    },
    configurable: true,
    writable: true,
  })
  useSessionStore.setState(useSessionStore.getInitialState())
})
function message(text: string): ConversationItem {
  return {
    id: 'item',
    sessionId,
    sequence: 1,
    turnId: 'turn',
    kind: 'message',
    state: 'streaming',
    actor: 'assistant',
    text,
    createdAt: 'same',
    updatedAt: 'same',
    providerMeta: {
      providerId: 'fake',
      providerItemId: null,
      providerEventType: null,
    },
  }
}
function emit(event: ConversationWireEvent<ConversationItem>) {
  useSessionStore.getState().handleConversationPatched(event)
}
function append(baseLength: number, text: string) {
  emit({
    op: 'append',
    sessionId,
    itemId: 'item',
    baseLength,
    append: text,
    updatedAt: 'same',
  })
}
function snapshot(text: string, generation: number) {
  emit({ op: 'snapshot', sessionId, items: [message(text)], generation })
}
function deferred() {
  let resolve!: (items: ConversationItem[]) => void
  const promise = new Promise<ConversationItem[]>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

for (const global of [false, true]) {
  describe(`MAR-3380 ${global ? 'global' : 'project'} streaming`, () => {
    function open(items: ConversationItem[] = []) {
      useSessionStore.setState(
        global
          ? {
              activeGlobalSessionId: sessionId,
              activeGlobalConversationSessionId: sessionId,
              activeGlobalConversation: items,
            }
          : {
              activeSessionId: sessionId,
              activeConversationSessionId: sessionId,
              activeConversation: items,
            },
      )
    }
    function current() {
      return global
        ? useSessionStore.getState().activeGlobalConversation
        : useSessionStore.getState().activeConversation
    }
    function load() {
      return global
        ? useSessionStore.getState().loadActiveGlobalConversation(sessionId)
        : useSessionStore.getState().loadActiveConversation(sessionId)
    }
    it('R2 appends and the full terminal equal the full-patch stream at every step', () => {
      open([message('')])
      let text = ''
      for (const words of ['hello', ' 🌍', '\nnext', ' words']) {
        const base = text.length
        text += words
        append(base, words)
        const appended = current()
        emit({ op: 'patch', sessionId, item: message(text) })
        expect(appended).toEqual(current())
      }
      const terminal = { ...message(text), state: 'complete' as const }
      emit({ op: 'patch', sessionId, item: terminal })
      expect(current()).toEqual([terminal])
      expect(resyncConversation).not.toHaveBeenCalled()
    })

    it.each(['gap', 'missing'] as const)(
      'R2/R2b %s requests one resync, drops pre-snapshot appends, then equals the full stream',
      (reason) => {
        open(reason === 'gap' ? [message('one')] : [])
        append(7, ' three')
        expect(resyncConversation).toHaveBeenCalledExactlyOnceWith(sessionId, 1)
        const before = current()
        // This fits the stale buffer: only the in-flight guard can reject it.
        if (reason === 'missing')
          emit({ op: 'patch', sessionId, item: message('one') })
        const waiting = current()
        append(3, ' WRONG')
        append(13, ' also dropped')
        expect(current()).toBe(waiting)
        expect(resyncConversation).toHaveBeenCalledTimes(1)
        if (reason === 'gap') expect(before).toEqual([message('one')])
        snapshot('one two three', 1)
        append(13, ' four')
        const recovered = current()
        emit({ op: 'patch', sessionId, item: message('one two three four') })
        expect(recovered).toEqual(current())
        expect(resyncConversation).toHaveBeenCalledTimes(1)
      },
    )

    it('R2c ignores generation 1 invoke after generation 2 ordered recovery', async () => {
      open()
      const initial = deferred()
      getConversation.mockReturnValueOnce(initial.promise)
      const pending = load()
      append(3, ' two')
      expect(resyncConversation).toHaveBeenCalledExactlyOnceWith(sessionId, 2)
      snapshot('one two', 2)
      append(7, ' three')
      const newest = current()
      initial.resolve([message('one')])
      await pending
      expect(current()).toBe(newest)
      expect(current()).toEqual([message('one two three')])
      snapshot('older snapshot', 1)
      expect(current()).toBe(newest)
    })

    it('R4 opens and switches back mid-stream with a flushed snapshot', async () => {
      open()
      getConversation.mockResolvedValueOnce([message('one')])
      await load()
      append(3, ' two')
      expect(current()).toEqual([message('one two')])
      useSessionStore.setState(
        global
          ? { activeGlobalSessionId: 'elsewhere' }
          : { activeSessionId: 'elsewhere' },
      )
      const state = useSessionStore.getState()
      const listener = vi.fn()
      const unsubscribe = useSessionStore.subscribe(listener)
      append(7, ' three')
      emit({ op: 'patch', sessionId, item: message('one two three') })
      expect(useSessionStore.getState()).toBe(state)
      expect(listener).not.toHaveBeenCalled()
      unsubscribe()
      open()
      getConversation.mockResolvedValueOnce([message('one two three')])
      await load()
      append(13, ' four')
      expect(current()).toEqual([message('one two three four')])
      expect(resyncConversation).not.toHaveBeenCalled()
    })

    it('R2b an invoke arriving during recovery cannot reopen the append stream', async () => {
      open()
      const initial = deferred()
      getConversation.mockReturnValueOnce(initial.promise)
      const pending = load()
      append(3, ' two')
      initial.resolve([message('one')])
      await pending
      expect(current()).toEqual([])
      snapshot('one two', 2)
      append(7, ' three')
      expect(current()).toEqual([message('one two three')])
    })
  })
}
