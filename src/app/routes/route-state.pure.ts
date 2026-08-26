import type { MainViewRoute } from '../App.container'

interface RouteMatchSnapshot {
  routeId: string
  params: Record<string, unknown>
  search: Record<string, unknown>
}

export function routeMatchToMainViewRoute(
  match: RouteMatchSnapshot | null | undefined,
): MainViewRoute {
  if (!match) return { kind: 'home' }

  switch (match.routeId) {
    case '/code/sessions/$sessionId':
      return {
        kind: 'code-session',
        sessionId: parseRequiredString(match.params.sessionId),
      }
    case '/code/sessions/new':
      return {
        kind: 'new-code-session',
        workspaceId: parseOptionalString(match.search.workspaceId),
      }
    case '/mission-control':
      return { kind: 'mission-control' }
    case '/chat/':
    case '/chat':
      return { kind: 'chat-home' }
    case '/chat/session/$sessionId':
      return {
        kind: 'chat-session',
        sessionId: parseRequiredString(match.params.sessionId),
      }
    case '/chat/space/$spaceId':
      return {
        kind: 'chat-space',
        spaceId: parseRequiredString(match.params.spaceId),
        draftAttempt: match.search.draft === true,
      }
    default:
      return { kind: 'home' }
  }
}

function parseRequiredString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
