import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, type Project } from '@/entities/project'
import type { Workspace } from '@/entities/workspace'
import type { Session, AttentionState } from '@/entities/session'
import {
  buildPaletteIndex,
  PALETTE_DIALOGS,
} from './command-palette-index.pure'
import type {
  SessionPaletteItem,
  DialogPaletteItem,
  NewSessionPaletteItem,
  NewWorkspacePaletteItem,
  WorkspacePaletteItem,
  ProjectPaletteItem,
  ForkSessionPaletteItem,
} from './command-center.types'

function makeProject(
  id: string,
  name: string,
  overrides: Partial<Project> = {},
): Project {
  return {
    id,
    name,
    repositoryPath: `/repos/${name}`,
    settings: DEFAULT_PROJECT_SETTINGS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeWorkspace(
  id: string,
  projectId: string,
  branchName: string,
  overrides: Partial<Workspace> = {},
): Workspace {
  return {
    id,
    projectId,
    branchName,
    path: `/worktrees/${id}`,
    type: 'worktree',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeSession(
  id: string,
  projectId: string,
  overrides: Partial<Session> = {},
): Session {
  return {
    id,
    projectId,
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: `session-${id}`,
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation' as const,
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildPaletteIndex', () => {
  it('emits a project item for each project', () => {
    const items = buildPaletteIndex({
      projects: [makeProject('p1', 'alpha'), makeProject('p2', 'beta')],
      workspaces: [],
      sessions: [],
      recentSessionIds: [],
      dismissals: {},
    })
    const projectItems = items.filter(
      (item): item is ProjectPaletteItem => item.kind === 'project',
    )
    expect(projectItems.map((p) => p.projectId)).toEqual(['p1', 'p2'])
    expect(projectItems[0]?.search.projectName).toBe('alpha')
  })

  it('emits a workspace item and a new-session item for each workspace', () => {
    const items = buildPaletteIndex({
      projects: [makeProject('p1', 'alpha')],
      workspaces: [makeWorkspace('w1', 'p1', 'feat/x')],
      sessions: [],
      recentSessionIds: [],
      dismissals: {},
    })
    const workspaceItems = items.filter(
      (item): item is WorkspacePaletteItem => item.kind === 'workspace',
    )
    const newSessionItems = items.filter(
      (item): item is NewSessionPaletteItem => item.kind === 'new-session',
    )
    expect(workspaceItems).toHaveLength(1)
    expect(workspaceItems[0]?.branchName).toBe('feat/x')
    expect(workspaceItems[0]?.projectName).toBe('alpha')
    expect(newSessionItems).toHaveLength(1)
    expect(newSessionItems[0]?.title).toBe('New session in feat/x')
    expect(newSessionItems[0]?.workspaceId).toBe('w1')
  })

  it('emits a new-workspace item for each project', () => {
    const items = buildPaletteIndex({
      projects: [makeProject('p1', 'alpha'), makeProject('p2', 'beta')],
      workspaces: [],
      sessions: [],
      recentSessionIds: [],
      dismissals: {},
    })
    const newWorkspaceItems = items.filter(
      (item): item is NewWorkspacePaletteItem => item.kind === 'new-workspace',
    )
    expect(newWorkspaceItems.map((item) => item.projectId)).toEqual([
      'p1',
      'p2',
    ])
    expect(newWorkspaceItems[0]?.title).toBe('New workspace in alpha')
  })

  it('filters archived sessions', () => {
    const items = buildPaletteIndex({
      projects: [makeProject('p1', 'alpha')],
      workspaces: [],
      sessions: [
        makeSession('s1', 'p1'),
        makeSession('s2', 'p1', {
          archivedAt: '2026-01-02T00:00:00.000Z',
        }),
      ],
      recentSessionIds: [],
      dismissals: {},
    })
    const sessionItems = items.filter(
      (item): item is SessionPaletteItem => item.kind === 'session',
    )
    expect(sessionItems.map((s) => s.sessionId)).toEqual(['s1'])
  })

  it('does not filter dismissed sessions at index level', () => {
    const items = buildPaletteIndex({
      projects: [makeProject('p1', 'alpha')],
      workspaces: [],
      sessions: [
        makeSession('s1', 'p1', {
          attention: 'needs-approval',
          updatedAt: '2026-02-01T00:00:00.000Z',
        }),
      ],
      recentSessionIds: [],
      dismissals: {
        s1: {
          updatedAt: '2026-02-01T00:00:00.000Z',
          disposition: 'snoozed',
        },
      },
    })
    const sessionItems = items.filter(
      (item): item is SessionPaletteItem => item.kind === 'session',
    )
    expect(sessionItems).toHaveLength(1)
  })

  it('emits all dialog items', () => {
    const items = buildPaletteIndex({
      projects: [],
      workspaces: [],
      sessions: [],
      recentSessionIds: [],
      dismissals: {},
    })
    const dialogItems = items.filter(
      (item): item is DialogPaletteItem => item.kind === 'dialog',
    )
    expect(dialogItems.map((item) => item.dialogKind)).toEqual(
      PALETTE_DIALOGS.map((d) => d.kind),
    )
  })

  it('emits a direct Insights dialog item with the app settings payload', () => {
    const items = buildPaletteIndex({
      projects: [],
      workspaces: [],
      sessions: [],
      recentSessionIds: [],
      dismissals: {},
    })
    const insights = items.find(
      (item): item is DialogPaletteItem =>
        item.kind === 'dialog' && item.id === 'dialog:app-settings:insights',
    )

    expect(insights).toMatchObject({
      dialogKind: 'app-settings',
      dialogPayload: { appSettingsSection: 'insights' },
      title: 'Open Insights',
      search: { aliases: expect.stringContaining('analytics') },
    })
  })

  it('emits a check-updates item exposed by the search title', () => {
    const items = buildPaletteIndex({
      projects: [],
      workspaces: [],
      sessions: [],
      recentSessionIds: [],
      dismissals: {},
    })
    const checkUpdates = items.filter((item) => item.kind === 'check-updates')
    expect(checkUpdates).toHaveLength(1)
    expect(checkUpdates[0]).toMatchObject({
      id: 'check-updates',
      title: 'Check for updates…',
      search: { title: 'Check for updates' },
    })
  })

  it('populates session search fields with project and branch names', () => {
    const items = buildPaletteIndex({
      projects: [makeProject('p1', 'alpha')],
      workspaces: [makeWorkspace('w1', 'p1', 'feat/x')],
      sessions: [
        makeSession('s1', 'p1', {
          workspaceId: 'w1',
          name: 'refactor login',
          attention: 'needs-input' satisfies AttentionState,
          providerId: 'codex',
        }),
      ],
      recentSessionIds: ['s1'],
      dismissals: {},
    })
    const session = items.find(
      (item): item is SessionPaletteItem => item.kind === 'session',
    )
    expect(session?.search.sessionName).toBe('refactor login')
    expect(session?.search.projectName).toBe('alpha')
    expect(session?.search.branchName).toBe('feat/x')
    expect(session?.search.providerId).toBe('codex')
    expect(session?.search.attentionAlias).toContain('input')
  })

  it('emits a fork-session item when an active session is focused', () => {
    const items = buildPaletteIndex({
      projects: [makeProject('p1', 'alpha')],
      workspaces: [],
      sessions: [makeSession('s1', 'p1', { name: 'investigate crash' })],
      recentSessionIds: [],
      dismissals: {},
      activeSessionId: 's1',
    })
    const forkItems = items.filter(
      (item): item is ForkSessionPaletteItem => item.kind === 'fork-session',
    )
    expect(forkItems).toHaveLength(1)
    expect(forkItems[0]?.sessionId).toBe('s1')
    expect(forkItems[0]?.title).toBe('Fork session: investigate crash')
  })

  it('does not emit a fork-session item when no session is focused', () => {
    const items = buildPaletteIndex({
      projects: [makeProject('p1', 'alpha')],
      workspaces: [],
      sessions: [makeSession('s1', 'p1')],
      recentSessionIds: [],
      dismissals: {},
    })
    const forkItems = items.filter((item) => item.kind === 'fork-session')
    expect(forkItems).toHaveLength(0)
  })

  it('does not emit a fork-session item when the focused session is archived', () => {
    const items = buildPaletteIndex({
      projects: [makeProject('p1', 'alpha')],
      workspaces: [],
      sessions: [
        makeSession('s1', 'p1', { archivedAt: '2026-01-02T00:00:00.000Z' }),
      ],
      recentSessionIds: [],
      dismissals: {},
      activeSessionId: 's1',
    })
    const forkItems = items.filter((item) => item.kind === 'fork-session')
    expect(forkItems).toHaveLength(0)
  })

  it('emits each session exactly once even when listed in recents', () => {
    const items = buildPaletteIndex({
      projects: [makeProject('p1', 'alpha')],
      workspaces: [],
      sessions: [makeSession('s1', 'p1'), makeSession('s2', 'p1')],
      recentSessionIds: ['s1', 's2', 's1'],
      dismissals: {},
    })
    const sessionIds = items
      .filter((item): item is SessionPaletteItem => item.kind === 'session')
      .map((item) => item.sessionId)
    expect(sessionIds).toEqual(['s1', 's2'])
  })
})
