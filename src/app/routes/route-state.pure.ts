import type { CodeReviewMode, CodeReviewView } from '@/entities/code-review'
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
    case '/code/review':
      return {
        kind: 'code-review',
        targetId: parseOptionalString(match.search.targetId),
        mode: parseCodeReviewMode(match.search.mode),
        view: parseCodeReviewView(match.search.view),
        filePath: parseOptionalString(match.search.file),
      }
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

function parseCodeReviewMode(value: unknown): CodeReviewMode {
  return value === 'base-branch' ? 'base-branch' : 'working-tree'
}

function parseCodeReviewView(value: unknown): CodeReviewView {
  return value === 'diff' ? 'diff' : 'guide'
}
