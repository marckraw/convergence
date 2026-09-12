import { expect, it, vi } from 'vitest'
import { useSessionStore } from './session.model'
import type { SessionSummary } from './session.types'

it('pin is optimistic, then reconciles the persisted summary (mutation: omit optimistic update)', async () => {
  const session = {
    id: 'pin',
    contextKind: 'global',
    updatedAt: 'original',
    pinnedAt: null,
  } as SessionSummary
  let resolve!: (s: SessionSummary) => void
  const setPinned = vi.fn(
    () =>
      new Promise<SessionSummary>((r) => {
        resolve = r
      }),
  )
  vi.stubGlobal('electronAPI', { session: { setPinned } })
  useSessionStore.setState({
    sessions: [],
    globalSessions: [session],
    globalChatSessions: [session],
  })
  const action = useSessionStore.getState().setPinned('pin', true)
  expect(useSessionStore.getState().globalSessions[0].pinnedAt).toMatch(
    /^\d{4}-/,
  )
  expect(useSessionStore.getState().globalChatSessions[0].pinnedAt).toBeTruthy()
  resolve({ ...session, pinnedAt: 'persisted' })
  await action
  expect(setPinned).toHaveBeenCalledWith('pin', true)
  expect(useSessionStore.getState().globalSessions[0].pinnedAt).toBe(
    'persisted',
  )
  expect(useSessionStore.getState().globalSessions[0].updatedAt).toBe(
    'original',
  )
  vi.unstubAllGlobals()
})
it('a refused pin restores only the pin, preserving a concurrent summary (mutation: rollback the whole row)', async () => {
  const session = {
    id: 'pin',
    name: 'before',
    contextKind: 'global',
    updatedAt: 'original',
    pinnedAt: null,
  } as SessionSummary
  let reject!: (error: Error) => void
  vi.stubGlobal('electronAPI', {
    session: {
      setPinned: () =>
        new Promise((_, r) => {
          reject = r
        }),
    },
  })
  useSessionStore.setState({
    globalSessions: [session],
    globalChatSessions: [session],
  })
  const action = useSessionStore.getState().setPinned('pin', true)
  const optimistic = useSessionStore.getState().globalSessions[0]
  useSessionStore
    .getState()
    .handleSessionSummaryUpdate({ ...optimistic, name: 'after' })
  reject(new Error('disk full'))
  await expect(action).rejects.toThrow('disk full')
  expect(useSessionStore.getState().globalSessions[0]).toMatchObject({
    name: 'after',
    pinnedAt: null,
  })
  vi.unstubAllGlobals()
})
