import { createFileRoute } from '@tanstack/react-router'
import { useMainViewNavigation } from '../../../navigation'
import { App } from '../../../App.container'

interface NewCodeSessionSearch {
  workspaceId: string | null
}

export const Route = createFileRoute('/code/sessions/new')({
  validateSearch: (search: Record<string, unknown>): NewCodeSessionSearch => ({
    workspaceId:
      typeof search.workspaceId === 'string' ? search.workspaceId : null,
  }),
  component: NewCodeSessionRoute,
})

function NewCodeSessionRoute() {
  const { workspaceId } = Route.useSearch()
  const navigation = useMainViewNavigation()

  return (
    <App
      mainViewRoute={{ kind: 'new-code-session', workspaceId }}
      onSelectCodeSession={navigation.navigateToCodeSession}
      onBeginCodeSessionDraft={navigation.navigateToNewCodeSession}
      onOpenCodeReview={navigation.navigateToCodeReview}
      onSelectChatSession={navigation.navigateToChatSession}
      onSelectChatSpace={navigation.navigateToChatSpace}
      onSelectAnySession={navigation.navigateToSession}
      onShowCode={navigation.navigateToWelcome}
      onShowChat={navigation.navigateToChatHome}
      onNewGlobalChat={navigation.navigateToChatHome}
    />
  )
}
