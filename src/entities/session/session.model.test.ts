import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from './session.model'

const mockElectronAPI = {
  session: {
    create: vi.fn(),
    getAll: vi.fn(),
    getByProjectId: vi.fn(),
    getById: vi.fn(),
    getNeedsYouDismissals: vi.fn().mockResolvedValue({}),
    archive: vi.fn().mockResolvedValue(undefined),
    unarchive: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    start: vi.fn(),
    sendMessage: vi.fn(),
    setNeedsYouDismissals: vi.fn().mockResolvedValue(undefined),
    getRecentIds: vi.fn().mockResolvedValue([]),
    setRecentIds: vi.fn().mockResolvedValue(undefined),
    approve: vi.fn(),
    deny: vi.fn(),
    stop: vi.fn(),
    onSessionUpdate: vi.fn(),
  },
  provider: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}

function makeSession(overrides: {
  id: string
  projectId?: string
  updatedAt?: string
  attention?: 'none' | 'needs-input' | 'needs-approval' | 'finished' | 'failed'
  archivedAt?: string | null
}) {
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? 'project-1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium' as const,
    name: `Session ${overrides.id}`,
    status: 'running' as const,
    attention: overrides.attention ?? ('none' as const),
    workingDirectory: '/tmp/project-1',
    transcript: [],
    archivedAt: overrides.archivedAt ?? null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  }
}

describe('useSessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: mockElectronAPI },
      writable: true,
      configurable: true,
    })
    useSessionStore.setState({
      sessions: [],
      globalSessions: [],
      needsYouDismissals: {},
      recentSessionIds: [],
      currentProjectId: null,
      activeSessionId: null,
      draftWorkspaceId: null,
      providers: [],
      error: null,
    })
  })

  it('clears project session context when preparing for a different project', () => {
    useSessionStore.setState({
      sessions: [
        {
          id: 'session-1',
          projectId: 'project-1',
          workspaceId: null,
          providerId: 'claude-code',
          model: 'sonnet',
          effort: 'medium',
          name: 'Session 1',
          status: 'running',
          attention: 'none',
          workingDirectory: '/tmp/project-1',
          transcript: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      globalSessions: [],
      needsYouDismissals: {},
      currentProjectId: 'project-1',
      activeSessionId: 'session-1',
      draftWorkspaceId: 'workspace-1',
      providers: [],
      error: null,
    })

    useSessionStore.getState().prepareForProject('project-2')

    const state = useSessionStore.getState()
    expect(state.currentProjectId).toBe('project-2')
    expect(state.sessions).toEqual([])
    expect(state.activeSessionId).toBeNull()
    expect(state.draftWorkspaceId).toBeNull()
  })

  it('ignores session updates for a different project', () => {
    useSessionStore.setState({
      sessions: [],
      globalSessions: [],
      needsYouDismissals: {},
      currentProjectId: 'project-1',
      activeSessionId: null,
      draftWorkspaceId: null,
      providers: [],
      error: null,
    })

    useSessionStore.getState().handleSessionUpdate({
      id: 'session-2',
      projectId: 'project-2',
      workspaceId: null,
      providerId: 'codex',
      model: 'gpt-5.4',
      effort: 'high',
      name: 'Other project session',
      status: 'running',
      attention: 'none',
      workingDirectory: '/tmp/project-2',
      transcript: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const state = useSessionStore.getState()
    expect(state.sessions).toEqual([])
    expect(state.globalSessions).toHaveLength(1)
    expect(state.globalSessions[0]?.id).toBe('session-2')
  })

  it('loads global sessions for cross-project attention tracking', async () => {
    mockElectronAPI.session.getAll.mockResolvedValueOnce([
      {
        id: 'session-1',
        projectId: 'project-1',
        workspaceId: null,
        providerId: 'claude-code',
        model: 'sonnet',
        effort: 'medium',
        name: 'Needs input session',
        status: 'running',
        attention: 'needs-input',
        workingDirectory: '/tmp/project-1',
        transcript: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'session-2',
        projectId: 'project-2',
        workspaceId: null,
        providerId: 'codex',
        model: 'gpt-5.4',
        effort: 'high',
        name: 'Finished session',
        status: 'completed',
        attention: 'finished',
        workingDirectory: '/tmp/project-2',
        transcript: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    mockElectronAPI.session.getNeedsYouDismissals.mockResolvedValueOnce({})

    await useSessionStore.getState().loadGlobalSessions()

    expect(mockElectronAPI.session.getAll).toHaveBeenCalledOnce()
    expect(mockElectronAPI.session.getNeedsYouDismissals).toHaveBeenCalledOnce()
    expect(useSessionStore.getState().globalSessions).toHaveLength(2)
  })

  it('loads and prunes persisted needs-you dismissals', async () => {
    mockElectronAPI.session.getAll.mockResolvedValueOnce([
      {
        id: 'session-1',
        projectId: 'project-1',
        workspaceId: null,
        providerId: 'claude-code',
        model: 'sonnet',
        effort: 'medium',
        name: 'Needs input session',
        status: 'running',
        attention: 'needs-input',
        workingDirectory: '/tmp/project-1',
        transcript: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    mockElectronAPI.session.getNeedsYouDismissals.mockResolvedValueOnce({
      'session-1': {
        updatedAt: '2026-01-01T00:00:00.000Z',
        disposition: 'snoozed',
      },
      stale: {
        updatedAt: '2026-01-01T00:00:00.000Z',
        disposition: 'acknowledged',
      },
    })

    await useSessionStore.getState().loadGlobalSessions()

    expect(useSessionStore.getState().needsYouDismissals).toEqual({
      'session-1': {
        updatedAt: '2026-01-01T00:00:00.000Z',
        disposition: 'snoozed',
      },
    })
    expect(mockElectronAPI.session.setNeedsYouDismissals).toHaveBeenCalledWith({
      'session-1': {
        updatedAt: '2026-01-01T00:00:00.000Z',
        disposition: 'snoozed',
      },
    })
  })

  it('dismisses a needs-you session until the session updates again', async () => {
    useSessionStore.setState({
      sessions: [],
      globalSessions: [
        {
          id: 'session-1',
          projectId: 'project-1',
          workspaceId: null,
          providerId: 'claude-code',
          model: 'sonnet',
          effort: 'medium',
          name: 'Needs input session',
          status: 'running',
          attention: 'needs-input',
          workingDirectory: '/tmp/project-1',
          transcript: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      needsYouDismissals: {},
      currentProjectId: 'project-1',
      activeSessionId: null,
      draftWorkspaceId: null,
      providers: [],
      error: null,
    })

    await useSessionStore.getState().dismissNeedsYouSession('session-1')
    expect(useSessionStore.getState().needsYouDismissals).toEqual({
      'session-1': {
        updatedAt: '2026-01-01T00:00:00.000Z',
        disposition: 'snoozed',
      },
    })
    expect(mockElectronAPI.session.setNeedsYouDismissals).toHaveBeenCalledWith({
      'session-1': {
        updatedAt: '2026-01-01T00:00:00.000Z',
        disposition: 'snoozed',
      },
    })

    useSessionStore.getState().handleSessionUpdate({
      id: 'session-1',
      projectId: 'project-1',
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: 'medium',
      name: 'Needs input session',
      status: 'running',
      attention: 'needs-input',
      workingDirectory: '/tmp/project-1',
      transcript: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
    })

    expect(useSessionStore.getState().needsYouDismissals).toEqual({})
  })

  it('acknowledges finished sessions instead of snoozing them', async () => {
    useSessionStore.setState({
      sessions: [],
      globalSessions: [
        {
          id: 'session-2',
          projectId: 'project-2',
          workspaceId: null,
          providerId: 'codex',
          model: 'gpt-5.4',
          effort: 'high',
          name: 'Finished session',
          status: 'completed',
          attention: 'finished',
          workingDirectory: '/tmp/project-2',
          transcript: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      needsYouDismissals: {},
      currentProjectId: 'project-2',
      activeSessionId: null,
      draftWorkspaceId: null,
      providers: [],
      error: null,
    })

    await useSessionStore.getState().dismissNeedsYouSession('session-2')

    expect(useSessionStore.getState().needsYouDismissals).toEqual({
      'session-2': {
        updatedAt: '2026-01-01T00:00:00.000Z',
        disposition: 'acknowledged',
      },
    })
  })

  it('archives a session and clears any persisted dismissal', async () => {
    useSessionStore.setState({
      sessions: [],
      globalSessions: [
        {
          id: 'session-2',
          projectId: 'project-2',
          workspaceId: null,
          providerId: 'codex',
          model: 'gpt-5.4',
          effort: 'high',
          name: 'Finished session',
          status: 'completed',
          attention: 'finished',
          workingDirectory: '/tmp/project-2',
          transcript: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      needsYouDismissals: {
        'session-2': {
          updatedAt: '2026-01-01T00:00:00.000Z',
          disposition: 'acknowledged',
        },
      },
      currentProjectId: 'project-2',
      activeSessionId: null,
      draftWorkspaceId: null,
      providers: [],
      error: null,
    })

    await useSessionStore.getState().archiveSession('session-2')

    expect(useSessionStore.getState().needsYouDismissals).toEqual({})
    expect(mockElectronAPI.session.setNeedsYouDismissals).toHaveBeenCalledWith(
      {},
    )
    expect(mockElectronAPI.session.archive).toHaveBeenCalledWith('session-2')
  })

  it('unarchives a session', async () => {
    await useSessionStore.getState().unarchiveSession('session-2')

    expect(mockElectronAPI.session.unarchive).toHaveBeenCalledWith('session-2')
  })

  it('recordRecentSession prepends and dedupes ids', () => {
    useSessionStore.getState().recordRecentSession('a')
    useSessionStore.getState().recordRecentSession('b')
    useSessionStore.getState().recordRecentSession('a')

    expect(useSessionStore.getState().recentSessionIds).toEqual(['a', 'b'])
    expect(mockElectronAPI.session.setRecentIds).toHaveBeenLastCalledWith([
      'a',
      'b',
    ])
  })

  it('recordRecentSession caps recents at 10', () => {
    for (let i = 0; i < 15; i += 1) {
      useSessionStore.getState().recordRecentSession(`id-${i}`)
    }

    const ids = useSessionStore.getState().recentSessionIds
    expect(ids).toHaveLength(10)
    expect(ids[0]).toBe('id-14')
    expect(ids[9]).toBe('id-5')
  })

  it('setActiveSession records recent id but null does not', () => {
    useSessionStore.getState().setActiveSession('session-a')
    useSessionStore.getState().setActiveSession(null)

    expect(useSessionStore.getState().recentSessionIds).toEqual(['session-a'])
  })

  it('loadRecents prunes ids missing from globalSessions', async () => {
    useSessionStore.setState({
      globalSessions: [makeSession({ id: 'keep' })],
    })
    mockElectronAPI.session.getRecentIds.mockResolvedValueOnce([
      'keep',
      'gone',
      'also-gone',
    ])

    await useSessionStore.getState().loadRecents()

    expect(useSessionStore.getState().recentSessionIds).toEqual(['keep'])
    expect(mockElectronAPI.session.setRecentIds).toHaveBeenCalledWith(['keep'])
  })

  it('deleteSession removes id from recents and persists', async () => {
    useSessionStore.setState({
      globalSessions: [
        makeSession({ id: 'session-1' }),
        makeSession({ id: 'session-2' }),
      ],
      recentSessionIds: ['session-1', 'session-2'],
    })
    mockElectronAPI.session.getByProjectId.mockResolvedValueOnce([])

    await useSessionStore.getState().deleteSession('session-1', 'project-1')

    expect(useSessionStore.getState().recentSessionIds).toEqual(['session-2'])
    expect(mockElectronAPI.session.setRecentIds).toHaveBeenCalledWith([
      'session-2',
    ])
  })
})
