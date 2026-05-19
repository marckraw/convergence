import { createFileRoute } from '@tanstack/react-router'
import { useMainViewNavigation } from '../../../navigation'
import { App } from '../../../App.container'

export const Route = createFileRoute('/code/sessions/$sessionId')({
  component: CodeSessionRoute,
})

function CodeSessionRoute() {
  const { sessionId } = Route.useParams()
  const navigation = useMainViewNavigation()

  return (
    <App
      mainViewRoute={{ kind: 'code-session', sessionId }}
      onSelectCodeSession={navigation.navigateToCodeSession}
      onBeginCodeSessionDraft={navigation.navigateToNewCodeSession}
      onOpenCodeReview={navigation.navigateToCodeReview}
      onSelectChatSession={navigation.navigateToChatSession}
      onSelectChatSpace={navigation.navigateToChatSpace}
      onSelectAnySession={navigation.navigateToSession}
      onShowCode={() => navigation.navigateToCodeSession(sessionId)}
      onShowChat={navigation.navigateToChatHome}
      onNewGlobalChat={navigation.navigateToChatHome}
    />
  )
}
