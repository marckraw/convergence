import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from './session.model'

const mockElectronAPI = {
  session: {
    create: vi.fn(),
    getAll: vi.fn(),
    getByProjectId: vi.fn(),
    getById: vi.fn(),
    delete: vi.fn(),
    start: vi.fn(),
    sendMessage: vi.fn(),
    approve: vi.fn(),
    deny: vi.fn(),
    stop: vi.fn(),
    onSessionUpdate: vi.fn(),
  },
  provider: {
    getAll: vi.fn().mockResolvedValue([]),
  },
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
    expect(state.globalSessions).toEqual([])
    expect(state.activeSessionId).toBeNull()
    expect(state.draftWorkspaceId).toBeNull()
  })

  it('ignores session updates for a different project', () => {
    useSessionStore.setState({
      sessions: [],
      globalSessions: [],
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

    await useSessionStore.getState().loadGlobalSessions()

    expect(mockElectronAPI.session.getAll).toHaveBeenCalledOnce()
    expect(useSessionStore.getState().globalSessions).toHaveLength(2)
  })
})
