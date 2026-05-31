import type { CodeReviewTarget } from '@/entities/code-review'
import type { Project } from '@/entities/project'
import type { SessionSummary } from '@/entities/session'
import type { Space } from '@/entities/space'
import type { Workspace } from '@/entities/workspace'
import type { MainViewRoute } from '../App.container'

export type MainViewRouteFallbackAction =
  | 'welcome'
  | 'chat-home'
  | 'code-review'

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
    | 'code-review-target-not-found'
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

export interface MainViewRouteResolutionInput {
  route: MainViewRoute
  catalogLoaded: boolean
  spacesLoaded: boolean
  codeReviewTargetsLoaded: boolean
  projects: readonly Project[]
  sessions: readonly SessionSummary[]
  chatSessions: readonly SessionSummary[]
  workspaces: readonly Workspace[]
  spaces: readonly Space[]
  codeReviewTargets: readonly CodeReviewTarget[]
}

export function resolveMainViewRoute(
  input: MainViewRouteResolutionInput,
): MainViewRouteResolution {
  const { route } = input

  switch (route.kind) {
    case 'home':
    case 'chat-home':
      return ready(route)
    case 'new-code-session':
      return resolveWorkspaceRoute(input, route.workspaceId)
    case 'code-session':
      return resolveCodeSessionRoute(input, route.sessionId)
    case 'chat-session':
      return resolveChatSessionRoute(input, route.sessionId)
    case 'chat-space':
      return resolveChatSpaceRoute(input, route.spaceId)
    case 'code-review':
      return resolveCodeReviewRoute(input, route.targetId)
  }
}

function resolveCodeSessionRoute(
  input: MainViewRouteResolutionInput,
  sessionId: string,
): MainViewRouteResolution {
  if (!input.catalogLoaded) return pending(input.route)

  const session = input.sessions.find((entry) => entry.id === sessionId)
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
  sessionId: string,
): MainViewRouteResolution {
  if (!input.catalogLoaded) return pending(input.route)

  const session = [...input.chatSessions, ...input.sessions].find(
    (entry) => entry.id === sessionId,
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

function resolveCodeReviewRoute(
  input: MainViewRouteResolutionInput,
  targetId: string | null,
): MainViewRouteResolution {
  if (!targetId) return ready(input.route)
  if (!input.codeReviewTargetsLoaded) return pending(input.route)

  const target = input.codeReviewTargets.find((entry) => entry.id === targetId)
  if (!target) {
    return fallback(input.route, {
      reason: 'code-review-target-not-found',
      title: 'Review target unavailable',
      message:
        'This Code Review route points to a target that no longer exists.',
      action: 'code-review',
      actionLabel: 'Open Code Review',
    })
  }

  const projectFallback = resolveProject(input, target.projectId)
  if (projectFallback) return fallback(input.route, projectFallback)

  const workspaceFallback = resolveWorkspace(input, target.workspaceId)
  if (workspaceFallback) return fallback(input.route, workspaceFallback)

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
