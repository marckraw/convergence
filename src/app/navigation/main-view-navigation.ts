import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { CodeReviewMode } from '@/entities/code-review'
import type { SessionSummary } from '@/entities/session'

export interface CodeReviewRouteSearch {
  targetId?: string | null
  mode?: CodeReviewMode
  file?: string | null
}

export interface MainViewNavigation {
  navigateToWelcome: () => void
  navigateToCodeSession: (sessionId: string) => void
  navigateToNewCodeSession: (workspaceId: string | null) => void
  navigateToCodeReview: (search?: CodeReviewRouteSearch) => void
  navigateToChatHome: () => void
  navigateToChatSession: (sessionId: string) => void
  navigateToChatSpace: (spaceId: string, options?: { draft?: boolean }) => void
  navigateToSession: (session: SessionSummary) => void
}

export function useMainViewNavigation(): MainViewNavigation {
  const navigate = useNavigate()

  const navigateToWelcome = useCallback(() => {
    void navigate({ to: '/' })
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

  const navigateToCodeReview = useCallback(
    (search: CodeReviewRouteSearch = {}) => {
      void navigate({
        to: '/code/review',
        search: {
          targetId: search.targetId ?? null,
          mode: search.mode ?? 'working-tree',
          file: search.file ?? null,
        },
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
    navigateToCodeSession,
    navigateToNewCodeSession,
    navigateToCodeReview,
    navigateToChatHome,
    navigateToChatSession,
    navigateToChatSpace,
    navigateToSession,
  }
}
