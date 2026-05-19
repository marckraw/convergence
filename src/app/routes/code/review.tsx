import { createFileRoute } from '@tanstack/react-router'
import type { CodeReviewMode } from '@/entities/code-review'
import { useMainViewNavigation } from '../../navigation'
import { App } from '../../App.container'

interface CodeReviewSearch {
  targetId: string | null
  mode: CodeReviewMode
  file: string | null
}

export const Route = createFileRoute('/code/review')({
  validateSearch: (search: Record<string, unknown>): CodeReviewSearch => ({
    targetId: parseOptionalString(search.targetId),
    mode: parseMode(search.mode),
    file: parseOptionalString(search.file),
  }),
  component: CodeReviewRoute,
})

function CodeReviewRoute() {
  const search = Route.useSearch()
  const navigation = useMainViewNavigation()

  return (
    <App
      mainViewRoute={{
        kind: 'code-review',
        targetId: search.targetId,
        mode: search.mode,
        filePath: search.file,
      }}
      onSelectCodeSession={navigation.navigateToCodeSession}
      onBeginCodeSessionDraft={navigation.navigateToNewCodeSession}
      onOpenCodeReview={() => navigation.navigateToCodeReview(search)}
      onCodeReviewSearchChange={(nextSearch) =>
        navigation.navigateToCodeReview({ ...search, ...nextSearch })
      }
      onCloseCodeReview={navigation.navigateToWelcome}
      onSelectChatSession={navigation.navigateToChatSession}
      onSelectChatSpace={navigation.navigateToChatSpace}
      onSelectAnySession={navigation.navigateToSession}
      onShowCode={navigation.navigateToWelcome}
      onShowChat={navigation.navigateToChatHome}
      onNewGlobalChat={navigation.navigateToChatHome}
    />
  )
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseMode(value: unknown): CodeReviewMode {
  return value === 'base-branch' ? 'base-branch' : 'working-tree'
}
