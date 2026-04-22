import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, useProjectStore } from '@/entities/project'
import type { Project } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSessionStore } from '@/entities/session'
import type { Session } from '@/entities/session'
import { useDialogStore } from '@/entities/dialog'
import type { Workspace } from '@/entities/workspace'
import {
  INITIAL_UPDATE_STATUS,
  useUpdatesStore,
  type UpdateStatus,
} from '@/entities/updates'
import {
  activateProject,
  beginSessionDraft,
  beginWorkspaceDraft,
  checkForUpdates,
  openDialog,
  switchToSession,
} from './intents'

function makeProject(id: string, name: string): Project {
  return {
    id,
    name,
    repositoryPath: `/repos/${name}`,
    settings: DEFAULT_PROJECT_SETTINGS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeSession(id: string, projectId: string): Session {
  return {
    id,
    projectId,
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: `session ${id}`,
    status: 'idle',
    attention: 'none',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('command-center intents', () => {
  const alpha = makeProject('p1', 'alpha')
  const beta = makeProject('p2', 'beta')

  let setActiveProject: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>
  let loadWorkspaces: ReturnType<
    typeof vi.fn<(projectId: string) => Promise<void>>
  >
  let loadCurrentBranch: ReturnType<
    typeof vi.fn<(repoPath: string) => Promise<void>>
  >
  let loadSessions: ReturnType<
    typeof vi.fn<(projectId: string) => Promise<void>>
  >
  let prepareForProject: ReturnType<
    typeof vi.fn<(projectId: string | null) => void>
  >
  let setActiveSession: ReturnType<typeof vi.fn<(id: string | null) => void>>
  let beginSessionDraftMock: ReturnType<
    typeof vi.fn<(workspaceId: string | null) => void>
  >

  const betaWorkspace: Workspace = {
    id: 'w-beta',
    projectId: 'p2',
    branchName: 'feature-x',
    path: '/repos/beta/feature-x',
    type: 'worktree',
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  beforeEach(() => {
    setActiveProject = vi.fn<(id: string) => Promise<void>>(
      async () => undefined,
    )
    loadWorkspaces = vi.fn<(projectId: string) => Promise<void>>(
      async () => undefined,
    )
    loadCurrentBranch = vi.fn<(repoPath: string) => Promise<void>>(
      async () => undefined,
    )
    loadSessions = vi.fn<(projectId: string) => Promise<void>>(
      async () => undefined,
    )
    prepareForProject = vi.fn<(projectId: string | null) => void>()
    setActiveSession = vi.fn<(id: string | null) => void>()
    beginSessionDraftMock = vi.fn<(workspaceId: string | null) => void>()

    useProjectStore.setState({
      projects: [alpha, beta],
      activeProject: alpha,
      setActiveProject,
    })
    useWorkspaceStore.setState({
      workspaces: [],
      globalWorkspaces: [betaWorkspace],
      currentBranch: null,
      loadWorkspaces,
      loadCurrentBranch,
    })
    useSessionStore.setState({
      sessions: [],
      globalSessions: [makeSession('s1', 'p2')],
      needsYouDismissals: {},
      recentSessionIds: [],
      currentProjectId: 'p1',
      activeSessionId: null,
      draftWorkspaceId: null,
      providers: [],
      error: null,
      prepareForProject,
      setActiveSession,
      loadSessions,
      beginSessionDraft: beginSessionDraftMock,
    })
    useDialogStore.setState({ openDialog: null })
  })

  describe('switchToSession', () => {
    it('hops to the target project and activates the session', async () => {
      await switchToSession('s1')

      expect(prepareForProject).toHaveBeenCalledWith('p2')
      expect(setActiveProject).toHaveBeenCalledWith('p2')
      expect(loadWorkspaces).toHaveBeenCalledWith('p2')
      expect(loadCurrentBranch).toHaveBeenCalledWith('/repos/beta')
      expect(loadSessions).toHaveBeenCalledWith('p2')
      expect(setActiveSession).toHaveBeenCalledWith('s1')
    })

    it('runs the three loads in parallel and sets active session last', async () => {
      await switchToSession('s1')

      const [loadWorkspacesOrder] = loadWorkspaces.mock.invocationCallOrder
      const [loadBranchOrder] = loadCurrentBranch.mock.invocationCallOrder
      const [loadSessionsOrder] = loadSessions.mock.invocationCallOrder
      const [setActiveOrder] = setActiveSession.mock.invocationCallOrder

      const latestLoad = Math.max(
        loadWorkspacesOrder,
        loadBranchOrder,
        loadSessionsOrder,
      )
      expect(setActiveOrder).toBeGreaterThan(latestLoad)
    })

    it('short-circuits the hop when the session project is already active', async () => {
      useProjectStore.setState({ activeProject: beta })

      await switchToSession('s1')

      expect(prepareForProject).not.toHaveBeenCalled()
      expect(setActiveProject).not.toHaveBeenCalled()
      expect(loadWorkspaces).not.toHaveBeenCalled()
      expect(loadCurrentBranch).not.toHaveBeenCalled()
      expect(loadSessions).not.toHaveBeenCalled()
      expect(setActiveSession).toHaveBeenCalledWith('s1')
    })

    it('no-ops when the session id is not in globalSessions', async () => {
      await switchToSession('missing')

      expect(prepareForProject).not.toHaveBeenCalled()
      expect(setActiveProject).not.toHaveBeenCalled()
      expect(setActiveSession).not.toHaveBeenCalled()
    })
  })

  describe('activateProject', () => {
    it('hops without touching activeSessionId', async () => {
      useSessionStore.setState({ activeSessionId: 's-original' })

      await activateProject('p2')

      expect(prepareForProject).toHaveBeenCalledWith('p2')
      expect(setActiveProject).toHaveBeenCalledWith('p2')
      expect(loadWorkspaces).toHaveBeenCalledWith('p2')
      expect(loadSessions).toHaveBeenCalledWith('p2')
      expect(setActiveSession).not.toHaveBeenCalled()
      expect(useSessionStore.getState().activeSessionId).toBe('s-original')
    })

    it('short-circuits when the project is already active', async () => {
      useProjectStore.setState({ activeProject: beta })

      await activateProject('p2')

      expect(prepareForProject).not.toHaveBeenCalled()
      expect(setActiveProject).not.toHaveBeenCalled()
      expect(loadWorkspaces).not.toHaveBeenCalled()
    })
  })

  describe('openDialog', () => {
    it('delegates to useDialogStore', () => {
      openDialog('providers')
      expect(useDialogStore.getState().openDialog).toBe('providers')
    })

    it('replaces an open dialog kind', () => {
      openDialog('app-settings')
      openDialog('mcp-servers')
      expect(useDialogStore.getState().openDialog).toBe('mcp-servers')
    })
  })

  describe('beginSessionDraft', () => {
    it('hops to the workspace owner project and starts a draft', async () => {
      await beginSessionDraft('w-beta')

      expect(setActiveProject).toHaveBeenCalledWith('p2')
      expect(beginSessionDraftMock).toHaveBeenCalledWith('w-beta')
    })

    it('skips the hop when the workspace lives in the active project', async () => {
      useProjectStore.setState({ activeProject: beta })

      await beginSessionDraft('w-beta')

      expect(setActiveProject).not.toHaveBeenCalled()
      expect(beginSessionDraftMock).toHaveBeenCalledWith('w-beta')
    })

    it('no-ops when the workspace id is not in globalWorkspaces', async () => {
      await beginSessionDraft('missing')

      expect(setActiveProject).not.toHaveBeenCalled()
      expect(beginSessionDraftMock).not.toHaveBeenCalled()
    })
  })

  describe('beginWorkspaceDraft', () => {
    it('activates the target project when it is not already active', async () => {
      await beginWorkspaceDraft('p2')

      expect(setActiveProject).toHaveBeenCalledWith('p2')
    })

    it('short-circuits when the target project is already active', async () => {
      useProjectStore.setState({ activeProject: beta })

      await beginWorkspaceDraft('p2')

      expect(setActiveProject).not.toHaveBeenCalled()
    })
  })

  describe('checkForUpdates', () => {
    it('delegates to useUpdatesStore.check', async () => {
      const check = vi.fn<() => Promise<void>>(async () => undefined)
      useUpdatesStore.setState({
        status: INITIAL_UPDATE_STATUS as UpdateStatus,
        currentVersion: '0.16.0',
        isDev: false,
        check,
      })

      await checkForUpdates()
      expect(check).toHaveBeenCalledTimes(1)
    })
  })
})
