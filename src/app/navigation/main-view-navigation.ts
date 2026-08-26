import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { SessionSummary } from '@/entities/session'

export interface MainViewNavigation {
  navigateToWelcome: () => Promise<void>
  replaceWithWelcome: () => Promise<void>
  navigateToMissionControl: () => void
  navigateToCodeSession: (sessionId: string) => void
  navigateToNewCodeSession: (workspaceId: string | null) => void
  navigateToChatHome: () => void
  navigateToChatSession: (sessionId: string) => void
  navigateToChatSpace: (spaceId: string, options?: { draft?: boolean }) => void
  navigateToSession: (session: SessionSummary) => void
}

export function useMainViewNavigation(): MainViewNavigation {
  const navigate = useNavigate()

  const navigateToWelcome = useCallback(() => {
    return navigate({ to: '/' })
  }, [navigate])

  const replaceWithWelcome = useCallback(() => {
    return navigate({ to: '/', replace: true })
  }, [navigate])

  const navigateToMissionControl = useCallback(() => {
    void navigate({ to: '/mission-control' })
  }, [navigate])

  const navigateToCodeSession = useCallback(
    (sessionId: string) => {
      void navigate({
        to: '/code/sessions/$sessionId',
        params: { sessionId },
      })
    },
    [navigate],
  )

  const navigateToNewCodeSession = useCallback(
    (workspaceId: string | null) => {
      void navigate({
        to: '/code/sessions/new',
        search: { workspaceId },
      })
    },
    [navigate],
  )

  const navigateToChatHome = useCallback(() => {
    void navigate({ to: '/chat' })
  }, [navigate])

  const navigateToChatSession = useCallback(
    (sessionId: string) => {
      void navigate({
        to: '/chat/session/$sessionId',
        params: { sessionId },
      })
    },
    [navigate],
  )

  const navigateToChatSpace = useCallback(
    (spaceId: string, options?: { draft?: boolean }) => {
      void navigate({
        to: '/chat/space/$spaceId',
        params: { spaceId },
        search: { draft: options?.draft === true },
      })
    },
    [navigate],
  )

  const navigateToSession = useCallback(
    (session: SessionSummary) => {
      if (session.contextKind === 'global') {
        navigateToChatSession(session.id)
        return
      }
      navigateToCodeSession(session.id)
    },
    [navigateToChatSession, navigateToCodeSession],
  )

  return {
    navigateToWelcome,
    replaceWithWelcome,
    navigateToMissionControl,
    navigateToCodeSession,
    navigateToNewCodeSession,
    navigateToChatHome,
    navigateToChatSession,
    navigateToChatSpace,
    navigateToSession,
  }
}
