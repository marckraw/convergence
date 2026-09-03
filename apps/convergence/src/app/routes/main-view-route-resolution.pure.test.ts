import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, type Project } from '@/entities/project'
import type { SessionSummary } from '@/entities/session'
import type { Space } from '@/entities/space'
import type { Workspace } from '@/entities/workspace'
import type { MainViewRoute } from '../App.container'
import { resolveMainViewRoute } from './main-view-route-resolution.pure'

const project: Project = {
  id: 'project-1',
  name: 'Project',
  repositoryPath: '/repo',
  settings: DEFAULT_PROJECT_SETTINGS,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  laneOf: null,
  laneName: null,
}

const workspace: Workspace = {
  id: 'workspace-1',
  projectId: project.id,
  branchName: 'feature',
  path: '/repo-worktree',
  type: 'worktree',
  archivedAt: null,
  worktreeRemovedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const codeSession: SessionSummary = {
  id: 'code-1',
  contextKind: 'project',
  projectId: project.id,
  workspaceId: workspace.id,
  providerId: 'claude-code',
  model: null,
  effort: null,
  name: 'Code',
  status: 'idle',
  attention: 'none',
  activity: null,
  contextWindow: null,
  workingDirectory: workspace.path,
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const chatSession: SessionSummary = {
  ...codeSession,
  id: 'chat-1',
  contextKind: 'global',
  projectId: null,
  workspaceId: null,
  name: 'Chat',
}

const space: Space = {
  id: 'space-1',
  title: 'Space',
  status: 'implementing',
  attention: 'none',
  brief: '',
  memory: '',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function resolve(route: MainViewRoute, overrides = {}) {
  return resolveMainViewRoute({
    route,
    catalogLoaded: true,
    spacesLoaded: true,
    projects: [project],
    sessions: [codeSession],
    chatSessions: [chatSession],
    workspaces: [workspace],
    spaces: [space],
    ...overrides,
  })
}

describe('resolveMainViewRoute', () => {
  it('keeps valid main view routes ready', () => {
    expect(resolve({ kind: 'code-session', sessionId: 'code-1' })).toEqual({
      status: 'ready',
      route: { kind: 'code-session', sessionId: 'code-1' },
    })
    expect(resolve({ kind: 'chat-session', sessionId: 'chat-1' })).toEqual({
      status: 'ready',
      route: { kind: 'chat-session', sessionId: 'chat-1' },
    })
    expect(
      resolve({ kind: 'chat-space', spaceId: 'space-1', draftAttempt: false }),
    ).toEqual({
      status: 'ready',
      route: { kind: 'chat-space', spaceId: 'space-1', draftAttempt: false },
    })
  })

  it('waits for route catalogs before deciding an id is invalid', () => {
    expect(
      resolve(
        { kind: 'code-session', sessionId: 'missing' },
        { catalogLoaded: false, sessions: [] },
      ),
    ).toEqual({
      status: 'pending',
      route: { kind: 'code-session', sessionId: 'missing' },
    })
  })

  it('falls back for invalid code and chat session ids', () => {
    expect(
      resolve({ kind: 'code-session', sessionId: 'missing' }),
    ).toMatchObject({
      status: 'fallback',
      fallback: { reason: 'session-not-found', action: 'welcome' },
    })
    expect(
      resolve({ kind: 'chat-session', sessionId: 'missing' }),
    ).toMatchObject({
      status: 'fallback',
      fallback: { reason: 'session-not-found', action: 'chat-home' },
    })
  })

  it('falls back for archived sessions', () => {
    expect(
      resolve(
        { kind: 'code-session', sessionId: 'code-1' },
        { sessions: [{ ...codeSession, archivedAt: '2026-01-02' }] },
      ),
    ).toMatchObject({
      status: 'fallback',
      fallback: { reason: 'session-archived' },
    })
  })

  it('falls back for missing projects and removed worktrees', () => {
    expect(
      resolve({ kind: 'code-session', sessionId: 'code-1' }, { projects: [] }),
    ).toMatchObject({
      status: 'fallback',
      fallback: { reason: 'project-not-found' },
    })
    expect(
      resolve(
        { kind: 'code-session', sessionId: 'code-1' },
        { projects: [{ ...project, id: 'other' }] },
      ),
    ).toMatchObject({
      status: 'fallback',
      fallback: { reason: 'project-not-found' },
    })
    expect(
      resolve(
        { kind: 'code-session', sessionId: 'code-1' },
        {
          workspaces: [
            { ...workspace, worktreeRemovedAt: '2026-01-02T00:00:00.000Z' },
          ],
        },
      ),
    ).toMatchObject({
      status: 'fallback',
      fallback: { reason: 'worktree-removed' },
    })
  })

  it('falls back for invalid Spaces', () => {
    expect(
      resolve(
        { kind: 'chat-space', spaceId: 'missing', draftAttempt: false },
        { spaces: [] },
      ),
    ).toMatchObject({
      status: 'fallback',
      fallback: { reason: 'space-not-found', action: 'chat-home' },
    })
  })
})
