import { createFileRoute } from '@tanstack/react-router'
import { App } from '../../../App.container'
import { useMainViewNavigation } from '../../../navigation'

export const Route = createFileRoute('/chat/session/$sessionId')({
  component: ChatSessionRoute,
})

function ChatSessionRoute() {
  const { sessionId } = Route.useParams()
  const navigation = useMainViewNavigation()

  return (
    <App
      mainViewRoute={{ kind: 'chat-session', sessionId }}
      onSelectCodeSession={navigation.navigateToCodeSession}
      onBeginCodeSessionDraft={navigation.navigateToNewCodeSession}
      onOpenCodeReview={navigation.navigateToCodeReview}
      onSelectChatSession={navigation.navigateToChatSession}
      onSelectChatSpace={navigation.navigateToChatSpace}
      onSelectAnySession={navigation.navigateToSession}
      onShowCode={navigation.navigateToWelcome}
      onShowChat={() => navigation.navigateToChatSession(sessionId)}
      onNewGlobalChat={navigation.navigateToChatHome}
    />
  )
}
