import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from './session.model'
import type { ConversationItem } from './session.types'
import type { ConversationWireEvent } from '@/shared/types/conversation-item.types'

const getConversation = vi.fn()
const resyncConversation = vi.fn().mockResolvedValue(undefined)
let sessionId: string
let serial = 0
beforeEach(() => {
  vi.resetAllMocks()
  resyncConversation.mockResolvedValue(undefined)
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
function snapshot(
  text: string,
  generation: number,
  pageNonce = resyncConversation.mock.lastCall?.[2],
) {
  emit({
    op: 'snapshot',
    sessionId,
    items: [message(text)],
    generation,
    pageNonce,
  })
}
function deferred() {
  let resolve!: (items?: ConversationItem[]) => void
  let reject!: (error: Error) => void
  const promise = new Promise<ConversationItem[] | undefined>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
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
    function close() {
      useSessionStore.setState(
        global
          ? { activeGlobalSessionId: 'elsewhere' }
          : { activeSessionId: 'elsewhere' },
      )
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
        expect(resyncConversation).toHaveBeenCalledExactlyOnceWith(
          sessionId,
          1,
          expect.any(String),
        )
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

    it('R2c ignores an older snapshot after a newer ordered recovery', async () => {
      open()
      void load()
      snapshot('one', 1)
      append(9, ' gap')
      expect(resyncConversation).toHaveBeenLastCalledWith(
        sessionId,
        2,
        expect.any(String),
      )
      snapshot('one two', 2)
      append(7, ' three')
      const newest = current()
      expect(current()).toEqual([message('one two three')])
      snapshot('older snapshot', 1)
      expect(current()).toBe(newest)
    })

    it('R4 opens and switches back mid-stream with a flushed snapshot', async () => {
      open()
      void load()
      snapshot('one', 1)
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
      void load()
      snapshot('one two three', 2)
      append(13, ' four')
      expect(current()).toEqual([message('one two three four')])
      expect(resyncConversation).toHaveBeenCalledTimes(2)
      expect(getConversation).not.toHaveBeenCalled()
    })

    it('R2e opens mid-stream with exactly one snapshot and a late acknowledgment cannot overwrite the terminal', async () => {
      open()
      const initial = deferred()
      // A legacy invoke implementation receives the same delayed partial data.
      getConversation.mockReturnValueOnce(initial.promise)
      resyncConversation.mockReturnValueOnce(initial.promise)
      const pending = load()
      append(3, ' two')
      append(7, ' three')
      expect(current()).toEqual([])
      expect(resyncConversation).toHaveBeenCalledExactlyOnceWith(
        sessionId,
        1,
        expect.any(String),
      )
      snapshot('one two', 1)
      append(7, ' three')
      const terminal = {
        ...message('one two three'),
        state: 'complete' as const,
      }
      emit({ op: 'patch', sessionId, item: terminal })
      initial.resolve([message('one')])
      await pending
      expect(current()).toEqual([terminal])
      expect(resyncConversation).toHaveBeenCalledTimes(1)
      expect(getConversation).not.toHaveBeenCalled()
    })

    it('R2d clears a resync snapshot received while closed before reopening', () => {
      open([message('one')])
      append(7, ' three')
      close()
      const state = useSessionStore.getState()
      const listener = vi.fn()
      const unsubscribe = useSessionStore.subscribe(listener)
      snapshot('one two three', 1)
      expect(useSessionStore.getState()).toBe(state)
      expect(listener).not.toHaveBeenCalled()
      unsubscribe()
      open()
      void load()
      expect(resyncConversation).toHaveBeenLastCalledWith(
        sessionId,
        2,
        expect.any(String),
      )
      snapshot('one two three', 2)
      append(13, ' four')
      expect(current()).toEqual([message('one two three four')])
    })

    it('R2e a delayed load reply cannot replace a later terminal full patch', async () => {
      open()
      const initial = deferred()
      getConversation.mockReturnValueOnce(initial.promise)
      resyncConversation.mockReturnValueOnce(initial.promise)
      const pending = load()
      snapshot('one', 1)
      const terminal = {
        ...message('one two three'),
        state: 'complete' as const,
      }
      emit({ op: 'patch', sessionId, item: terminal })
      initial.resolve([message('one')])
      await pending
      expect(current()).toEqual([terminal])
    })

    it('R2d a rejected resync retries the blocked open with a fresh load', async () => {
      const recovery = deferred()
      resyncConversation.mockReturnValueOnce(recovery.promise)
      open([message('one')])
      append(7, ' three')
      close()
      open()
      await load()
      expect(resyncConversation).toHaveBeenCalledTimes(1)
      recovery.reject(new Error('resync rejected'))
      await vi.waitFor(() =>
        expect(resyncConversation).toHaveBeenCalledTimes(2),
      )
      expect(resyncConversation).toHaveBeenLastCalledWith(
        sessionId,
        2,
        expect.any(String),
      )
      snapshot('one two three', 2)
      append(13, ' four')
      expect(current()).toEqual([message('one two three four')])
      expect(useSessionStore.getState().error).toBe('resync rejected')
    })

    it('R2d ignores a previous page snapshot with a higher generation and still recovers', () => {
      open([message('one')])
      append(7, ' three')
      const pageNonce = resyncConversation.mock.lastCall?.[2]
      expect(pageNonce).toEqual(expect.any(String))
      const before = current()
      snapshot('old page', 999, 'previous-page')
      expect(current()).toBe(before)
      snapshot('one two three', 1)
      append(13, ' four')
      expect(current()).toEqual([message('one two three four')])
      append(99, ' gap')
      expect(resyncConversation).toHaveBeenLastCalledWith(
        sessionId,
        2,
        pageNonce,
      )
      snapshot('recovered', 2)
      append(9, ' again')
      expect(current()).toEqual([message('recovered again')])
    })

    it('R2e a rejected initial load releases its pending request for a later open', async () => {
      open()
      resyncConversation.mockRejectedValueOnce(new Error('load rejected'))
      await load()
      expect(useSessionStore.getState().error).toBe('load rejected')
      void load()
      expect(resyncConversation).toHaveBeenLastCalledWith(
        sessionId,
        2,
        expect.any(String),
      )
      snapshot('one', 2)
      append(3, ' two')
      expect(current()).toEqual([message('one two')])
    })
  })
}
