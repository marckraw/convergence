import { useEffect } from 'react'
import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useSessionStore } from '@/entities/session'
import { App } from '../App.container'
import { useMainViewNavigation } from '../navigation'
import { routeMatchToMainViewRoute } from './route-state.pure'

export const Route = createRootRoute({
  component: RootRoute,
  notFoundComponent: RootNotFoundRoute,
})

function RootRoute() {
  const navigation = useMainViewNavigation()
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const activeGlobalSessionId = useSessionStore(
    (state) => state.activeGlobalSessionId,
  )
  const mainViewRoute = useRouterState({
    select: (state) => {
      const match = state.matches[state.matches.length - 1]
      return routeMatchToMainViewRoute(
        match
          ? {
              routeId: match.routeId,
              params: match.params as Record<string, unknown>,
              search: match.search as Record<string, unknown>,
            }
          : null,
      )
    },
  })

  return (
    <>
      <App
        mainViewRoute={mainViewRoute}
        onSelectCodeSession={navigation.navigateToCodeSession}
        onBeginCodeSessionDraft={navigation.navigateToNewCodeSession}
        onSelectChatSession={navigation.navigateToChatSession}
        onSelectChatSpace={navigation.navigateToChatSpace}
        onBeginChatSpaceAttempt={(spaceId) =>
          navigation.navigateToChatSpace(spaceId, { draft: true })
        }
        onCancelChatSpaceAttempt={(spaceId) =>
          navigation.navigateToChatSpace(spaceId)
        }
        onSelectAnySession={navigation.navigateToSession}
        onShowCode={() => {
          if (activeSessionId) {
            navigation.navigateToCodeSession(activeSessionId)
            return
          }
          void navigation.navigateToWelcome()
        }}
        onShowCodeHome={navigation.navigateToWelcome}
        onShowChat={() => {
          if (activeGlobalSessionId) {
            navigation.navigateToChatSession(activeGlobalSessionId)
            return
          }
          navigation.navigateToChatHome()
        }}
        onShowMissionControl={navigation.navigateToMissionControl}
        onNewGlobalChat={navigation.navigateToChatHome}
      />
      <Outlet />
    </>
  )
}

function RootNotFoundRoute() {
  const { replaceWithWelcome } = useMainViewNavigation()

  useEffect(() => {
    void replaceWithWelcome()
  }, [replaceWithWelcome])

  return null
}
