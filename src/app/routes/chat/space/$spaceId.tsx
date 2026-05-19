import { createFileRoute } from '@tanstack/react-router'
import { App } from '../../../App.container'
import { useMainViewNavigation } from '../../../navigation'

interface ChatSpaceSearch {
  draft: boolean
}

export const Route = createFileRoute('/chat/space/$spaceId')({
  validateSearch: (search: Record<string, unknown>): ChatSpaceSearch => ({
    draft: search.draft === true || search.draft === 'true',
  }),
  component: ChatSpaceRoute,
})

function ChatSpaceRoute() {
  const { spaceId } = Route.useParams()
  const { draft } = Route.useSearch()
  const navigation = useMainViewNavigation()

  return (
    <App
      mainViewRoute={{ kind: 'chat-space', spaceId, draftAttempt: draft }}
      onSelectCodeSession={navigation.navigateToCodeSession}
      onBeginCodeSessionDraft={navigation.navigateToNewCodeSession}
      onOpenCodeReview={navigation.navigateToCodeReview}
      onSelectChatSession={navigation.navigateToChatSession}
      onSelectChatSpace={navigation.navigateToChatSpace}
      onBeginChatSpaceAttempt={(nextSpaceId) =>
        navigation.navigateToChatSpace(nextSpaceId, { draft: true })
      }
      onCancelChatSpaceAttempt={(nextSpaceId) =>
        navigation.navigateToChatSpace(nextSpaceId)
      }
      onSelectAnySession={navigation.navigateToSession}
      onShowCode={navigation.navigateToWelcome}
      onShowChat={() => navigation.navigateToChatSpace(spaceId)}
      onNewGlobalChat={navigation.navigateToChatHome}
    />
  )
}
