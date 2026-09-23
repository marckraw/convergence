import type { Project } from '@/entities/project'
import type { SessionSummary } from '@/entities/session'
import type { Space } from '@/entities/space'
import type { Workspace } from '@/entities/workspace'
import type { MainViewRoute } from '../App.container'

export type MainViewRouteFallbackAction = 'welcome' | 'chat-home'

export interface MainViewRouteFallback {
  reason:
    | 'session-not-found'
    | 'session-archived'
    | 'session-route-mismatch'
    | 'project-not-found'
    | 'workspace-not-found'
    | 'workspace-archived'
    | 'worktree-removed'
    | 'space-not-found'
    | 'space-archived'
  title: string
  message: string
  action: MainViewRouteFallbackAction
  actionLabel: string
}

export type MainViewRouteResolution =
  | { status: 'ready'; route: MainViewRoute }
  | { status: 'pending'; route: MainViewRoute }
  | {
      status: 'fallback'
      route: MainViewRoute
      fallback: MainViewRouteFallback
    }

/**
 * The only fields of a conversation route resolution reads. The shell selects
 * exactly these for the routed conversation, so a status, activity or
 * `updatedAt` change -- or any other conversation's summary -- cannot reach
 * it (MAR-3377 R1). A field added to the checks below must be added here, or
 * the type refuses the read.
 */
export type RouteSessionFacts = Pick<
  SessionSummary,
  'id' | 'contextKind' | 'projectId' | 'workspaceId' | 'archivedAt'
>

export interface MainViewRouteResolutionInput {
  route: MainViewRoute
  catalogLoaded: boolean
  spacesLoaded: boolean
  projects: readonly Project[]
  sessions: readonly RouteSessionFacts[]
  chatSessions: readonly RouteSessionFacts[]
  workspaces: readonly Workspace[]
  spaces: readonly Space[]
}

/**
 * The conversation a route points at, found the one way resolution finds it:
 * a Code Session route looks in the code list only; a Chat Session route looks
 * in the chat list first, then the code list (which is what makes a
 * mismatched id resolve to "wrong session route" rather than "not found").
 */
export function findRouteSession<T extends RouteSessionFacts>(
  route: MainViewRoute,
  sessions: readonly T[],
  chatSessions: readonly T[],
): T | null {
  switch (route.kind) {
    case 'code-session':
      return sessions.find((entry) => entry.id === route.sessionId) ?? null
    case 'chat-session':
      return (
        chatSessions.find((entry) => entry.id === route.sessionId) ??
        sessions.find((entry) => entry.id === route.sessionId) ??
        null
      )
    default:
      return null
  }
}

/** The route facts of a conversation, or null; a fresh object each call. */
export function pickRouteSessionFacts(
  session: RouteSessionFacts | null,
): RouteSessionFacts | null {
  if (!session) return null
  return {
    id: session.id,
    contextKind: session.contextKind,
    projectId: session.projectId,
    workspaceId: session.workspaceId,
    archivedAt: session.archivedAt,
  }
}

export function resolveMainViewRoute(
  input: MainViewRouteResolutionInput,
): MainViewRouteResolution {
  const { route } = input

  switch (route.kind) {
    case 'home':
    case 'chat-home':
    case 'mission-control':
      return ready(route)
    case 'new-code-session':
      return resolveWorkspaceRoute(input, route.workspaceId)
    case 'code-session':
      return resolveCodeSessionRoute(input)
    case 'chat-session':
      return resolveChatSessionRoute(input)
    case 'chat-space':
      return resolveChatSpaceRoute(input, route.spaceId)
  }
}

function resolveCodeSessionRoute(
  input: MainViewRouteResolutionInput,
): MainViewRouteResolution {
  if (!input.catalogLoaded) return pending(input.route)

  const session = findRouteSession(
    input.route,
    input.sessions,
    input.chatSessions,
  )
  if (!session) {
    return fallback(input.route, {
      reason: 'session-not-found',
      title: 'Session not found',
      message:
        'This Code Session route points to a session that is unavailable.',
      action: 'welcome',
      actionLabel: 'Go to Code home',
    })
  }
  if (session.contextKind !== 'project') {
    return fallback(input.route, {
      reason: 'session-route-mismatch',
      title: 'Wrong session route',
      message:
        'This route is for Code Sessions, but the target is a Chat Session.',
      action: 'chat-home',
      actionLabel: 'Go to Chat',
    })
  }
  if (session.archivedAt) {
    return fallback(input.route, {
      reason: 'session-archived',
      title: 'Session is archived',
      message:
        'This Code Session is archived and cannot be opened as an active Main View.',
      action: 'welcome',
      actionLabel: 'Go to Code home',
    })
  }

  const projectFallback = resolveProject(input, session.projectId)
  if (projectFallback) return fallback(input.route, projectFallback)

  const workspaceFallback = resolveWorkspace(input, session.workspaceId)
  if (workspaceFallback) return fallback(input.route, workspaceFallback)

  return ready(input.route)
}

function resolveChatSessionRoute(
  input: MainViewRouteResolutionInput,
): MainViewRouteResolution {
  if (!input.catalogLoaded) return pending(input.route)

  const session = findRouteSession(
    input.route,
    input.sessions,
    input.chatSessions,
  )
  if (!session) {
    return fallback(input.route, {
      reason: 'session-not-found',
      title: 'Chat session not found',
      message:
        'This Chat Session route points to a session that is unavailable.',
      action: 'chat-home',
      actionLabel: 'Go to Chat',
    })
  }
  if (session.contextKind !== 'global') {
    return fallback(input.route, {
      reason: 'session-route-mismatch',
      title: 'Wrong session route',
      message:
        'This route is for Chat Sessions, but the target is a Code Session.',
      action: 'welcome',
      actionLabel: 'Go to Code home',
    })
  }
  if (session.archivedAt) {
    return fallback(input.route, {
      reason: 'session-archived',
      title: 'Chat session is archived',
      message:
        'This Chat Session is archived and cannot be opened as an active Main View.',
      action: 'chat-home',
      actionLabel: 'Go to Chat',
    })
  }

  return ready(input.route)
}

function resolveChatSpaceRoute(
  input: MainViewRouteResolutionInput,
  spaceId: string,
): MainViewRouteResolution {
  if (!input.spacesLoaded) return pending(input.route)

  const space = input.spaces.find((entry) => entry.id === spaceId)
  if (!space) {
    return fallback(input.route, {
      reason: 'space-not-found',
      title: 'Space not found',
      message: 'This Space route points to a Space that is unavailable.',
      action: 'chat-home',
      actionLabel: 'Go to Chat',
    })
  }
  if (space.archivedAt) {
    return fallback(input.route, {
      reason: 'space-archived',
      title: 'Space is archived',
      message:
        'This Space is archived and cannot be opened as an active Main View.',
      action: 'chat-home',
      actionLabel: 'Go to Chat',
    })
  }

  return ready(input.route)
}

function resolveWorkspaceRoute(
  input: MainViewRouteResolutionInput,
  workspaceId: string | null,
): MainViewRouteResolution {
  if (!workspaceId) return ready(input.route)
  if (!input.catalogLoaded) return pending(input.route)

  const workspaceFallback = resolveWorkspace(input, workspaceId)
  if (workspaceFallback) return fallback(input.route, workspaceFallback)

  return ready(input.route)
}

function resolveProject(
  input: MainViewRouteResolutionInput,
  projectId: string | null,
): MainViewRouteFallback | null {
  if (!projectId) return null
  if (input.projects.some((project) => project.id === projectId)) return null

  return {
    reason: 'project-not-found',
    title: 'Project unavailable',
    message: 'This route points to a project that is no longer available.',
    action: 'welcome',
    actionLabel: 'Go to Code home',
  }
}

function resolveWorkspace(
  input: MainViewRouteResolutionInput,
  workspaceId: string | null,
): MainViewRouteFallback | null {
  if (!workspaceId) return null

  const workspace = input.workspaces.find((entry) => entry.id === workspaceId)
  if (!workspace) {
    return {
      reason: 'workspace-not-found',
      title: 'Workspace unavailable',
      message: 'This route points to a workspace that is no longer available.',
      action: 'welcome',
      actionLabel: 'Go to Code home',
    }
  }
  if (workspace.archivedAt) {
    return {
      reason: 'workspace-archived',
      title: 'Workspace is archived',
      message:
        'This workspace is archived and cannot be opened as an active Main View.',
      action: 'welcome',
      actionLabel: 'Go to Code home',
    }
  }
  if (workspace.worktreeRemovedAt) {
    return {
      reason: 'worktree-removed',
      title: 'Worktree removed',
      message: 'This route needs a workspace worktree that has been removed.',
      action: 'welcome',
      actionLabel: 'Go to Code home',
    }
  }

  return null
}

function ready(route: MainViewRoute): MainViewRouteResolution {
  return { status: 'ready', route }
}

function pending(route: MainViewRoute): MainViewRouteResolution {
  return { status: 'pending', route }
}

function fallback(
  route: MainViewRoute,
  fallback: MainViewRouteFallback,
): MainViewRouteResolution {
  return { status: 'fallback', route, fallback }
}
