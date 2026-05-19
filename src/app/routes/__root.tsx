import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import type { CodeReviewMode } from '@/entities/code-review'
import { App } from '../App.container'
import { useMainViewNavigation } from '../navigation'
import { routeMatchToMainViewRoute } from './route-state.pure'

export const Route = createRootRoute({
  component: RootRoute,
})

function RootRoute() {
  const navigation = useMainViewNavigation()
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

  const currentCodeReviewSearch =
    mainViewRoute.kind === 'code-review'
      ? {
          targetId: mainViewRoute.targetId,
          mode: mainViewRoute.mode,
          file: mainViewRoute.filePath,
        }
      : null

  return (
    <>
      <App
        mainViewRoute={mainViewRoute}
        onSelectCodeSession={navigation.navigateToCodeSession}
        onBeginCodeSessionDraft={navigation.navigateToNewCodeSession}
        onOpenCodeReview={navigation.navigateToCodeReview}
        onCodeReviewSearchChange={(nextSearch: {
          targetId?: string | null
          mode?: CodeReviewMode
          file?: string | null
        }) =>
          navigation.navigateToCodeReview({
            ...currentCodeReviewSearch,
            ...nextSearch,
          })
        }
        onCloseCodeReview={navigation.navigateToWelcome}
        onSelectChatSession={navigation.navigateToChatSession}
        onSelectChatSpace={navigation.navigateToChatSpace}
        onBeginChatSpaceAttempt={(spaceId) =>
          navigation.navigateToChatSpace(spaceId, { draft: true })
        }
        onCancelChatSpaceAttempt={(spaceId) =>
          navigation.navigateToChatSpace(spaceId)
        }
        onSelectAnySession={navigation.navigateToSession}
        onShowCode={navigation.navigateToWelcome}
        onShowChat={navigation.navigateToChatHome}
        onNewGlobalChat={navigation.navigateToChatHome}
      />
      <Outlet />
    </>
  )
}
