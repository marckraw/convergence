import { useCallback, useRef } from 'react'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { sameSidebarList } from './sidebar-sessions.pure'

type SessionStoreState = ReturnType<typeof useSessionStore.getState>

const pickSessions = (state: SessionStoreState) => state.sessions
const pickGlobalSessions = (state: SessionStoreState) => state.globalSessions
const pickGlobalChatSessions = (state: SessionStoreState) =>
  state.globalChatSessions

/**
 * Held selector over one session list (MAR-3378 F1b). This is zustand's own
 * `useShallow` shape (a ref-held previous slice), with `sameSidebarList` as
 * the equality.
 *
 * A summary that changes nothing the sidebar shows at once (see
 * `sameForSidebar`) returns the held list, so the store update does not
 * re-render the sidebar. A new `refresh` token (the clock's tick, or a
 * dismissal change) makes the next read take the latest list whatever it
 * holds. That is how "Last moved", group order and a dismissed card's
 * return catch up.
 */
function useHeldSessionList(
  pick: (state: SessionStoreState) => SessionSummary[],
  refresh: unknown,
): SessionSummary[] {
  const held = useRef<{
    list: SessionSummary[]
    refresh: unknown
  } | null>(null)
  const select = useCallback(
    (state: SessionStoreState) => {
      const next = pick(state)
      const previous = held.current
      if (
        previous &&
        previous.refresh === refresh &&
        sameSidebarList(previous.list, next)
      ) {
        return previous.list
      }
      held.current = { list: next, refresh }
      return next
    },
    [pick, refresh],
  )
  return useSessionStore(select)
}

/**
 * The sidebar's three session lists, held against summaries that change
 * nothing it shows at once. `refresh` must change on every clock tick and on
 * every dismissal change.
 */
export function useSidebarSessionLists(refresh: unknown) {
  return {
    sessions: useHeldSessionList(pickSessions, refresh),
    globalSessions: useHeldSessionList(pickGlobalSessions, refresh),
    globalChatSessions: useHeldSessionList(pickGlobalChatSessions, refresh),
  }
}

/**
 * The newest summary for one conversation, read at call time. Handlers use
 * this rather than the held lists so that what leaves the sidebar is never a
 * copy held back for the clock.
 */
export function latestSessionSummary(id: string): SessionSummary | undefined {
  const state = useSessionStore.getState()
  return (
    state.sessions.find((session) => session.id === id) ??
    state.globalChatSessions.find((session) => session.id === id) ??
    state.globalSessions.find((session) => session.id === id)
  )
}
