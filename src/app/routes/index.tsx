import { createFileRoute } from '@tanstack/react-router'
import { useMainViewNavigation } from '../navigation'
import { App } from '../App.container'

export const Route = createFileRoute('/')({
  component: IndexRoute,
})

function IndexRoute() {
  const navigation = useMainViewNavigation()

  return (
    <App
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
