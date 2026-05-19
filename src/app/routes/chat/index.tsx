import { createFileRoute } from '@tanstack/react-router'
import { App } from '../../App.container'
import { useMainViewNavigation } from '../../navigation'

export const Route = createFileRoute('/chat')({
  component: ChatHomeRoute,
})

function ChatHomeRoute() {
  const navigation = useMainViewNavigation()

  return (
    <App
      mainViewRoute={{ kind: 'chat-home' }}
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
