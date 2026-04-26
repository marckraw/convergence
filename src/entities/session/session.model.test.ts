import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from './session.model'

const mockElectronAPI = {
  session: {
    create: vi.fn(),
    getAllSummaries: vi.fn(),
    getSummariesByProjectId: vi.fn(),
    getSummaryById: vi.fn(),
    getConversation: vi.fn().mockResolvedValue([]),
    getQueuedInputs: vi.fn().mockResolvedValue([]),
    cancelQueuedInput: vi.fn().mockResolvedValue(undefined),
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
    onSessionSummaryUpdate: vi.fn(),
    onSessionConversationPatched: vi.fn(),
    onSessionQueuedInputPatched: vi.fn(),
    forkPreviewSummary: vi.fn(),
    forkFull: vi.fn(),
    forkSummary: vi.fn(),
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
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp/project-1',
    archivedAt: overrides.archivedAt ?? null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation' as const,
    continuationToken: null,
    lastSequence: 0,
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
      queuedInputsBySessionId: {},
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
      sessions: [makeSession({ id: 'session-1' })],
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

    useSessionStore.getState().handleSessionSummaryUpdate({
      ...makeSession({ id: 'session-2', projectId: 'project-2' }),
      providerId: 'codex',
      model: 'gpt-5.4',
      effort: 'high',
      name: 'Other project session',
      workingDirectory: '/tmp/project-2',
    })

    const state = useSessionStore.getState()
    expect(state.sessions).toEqual([])
    expect(state.globalSessions).toHaveLength(1)
    expect(state.globalSessions[0]?.id).toBe('session-2')
  })

  it('loads global sessions for cross-project attention tracking', async () => {
    mockElectronAPI.session.getAllSummaries.mockResolvedValueOnce([
      {
        ...makeSession({ id: 'session-1', attention: 'needs-input' }),
        name: 'Needs input session',
      },
      {
        ...makeSession({
          id: 'session-2',
          projectId: 'project-2',
          attention: 'finished',
        }),
        providerId: 'codex',
        model: 'gpt-5.4',
        effort: 'high',
        name: 'Finished session',
        status: 'completed',
        workingDirectory: '/tmp/project-2',
      },
    ])
    mockElectronAPI.session.getNeedsYouDismissals.mockResolvedValueOnce({})

    await useSessionStore.getState().loadGlobalSessions()

    expect(mockElectronAPI.session.getAllSummaries).toHaveBeenCalledOnce()
    expect(mockElectronAPI.session.getNeedsYouDismissals).toHaveBeenCalledOnce()
    expect(useSessionStore.getState().globalSessions).toHaveLength(2)
  })

  it('loads and prunes persisted needs-you dismissals', async () => {
    mockElectronAPI.session.getAllSummaries.mockResolvedValueOnce([
      {
        ...makeSession({ id: 'session-1', attention: 'needs-input' }),
        name: 'Needs input session',
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
          ...makeSession({ id: 'session-1', attention: 'needs-input' }),
          name: 'Needs input session',
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

    useSessionStore.getState().handleSessionSummaryUpdate({
      ...makeSession({
        id: 'session-1',
        attention: 'needs-input',
        updatedAt: '2026-01-01T00:01:00.000Z',
      }),
      name: 'Needs input session',
    })

    expect(useSessionStore.getState().needsYouDismissals).toEqual({})
  })

  it('acknowledges finished sessions instead of snoozing them', async () => {
    useSessionStore.setState({
      sessions: [],
      globalSessions: [
        {
          ...makeSession({
            id: 'session-2',
            projectId: 'project-2',
            attention: 'finished',
          }),
          providerId: 'codex',
          model: 'gpt-5.4',
          effort: 'high',
          name: 'Finished session',
          status: 'completed',
          workingDirectory: '/tmp/project-2',
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
          ...makeSession({
            id: 'session-2',
            projectId: 'project-2',
            attention: 'finished',
          }),
          providerId: 'codex',
          model: 'gpt-5.4',
          effort: 'high',
          name: 'Finished session',
          status: 'completed',
          workingDirectory: '/tmp/project-2',
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

  it('loads queued inputs for the active session', async () => {
    const queuedInput = {
      id: 'queued-1',
      sessionId: 'session-a',
      deliveryMode: 'follow-up' as const,
      state: 'queued' as const,
      text: 'after this',
      attachmentIds: [],
      skillSelections: [],
      providerRequestId: null,
      error: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    mockElectronAPI.session.getQueuedInputs.mockResolvedValueOnce([queuedInput])

    useSessionStore.setState({ activeSessionId: 'session-a' })
    await useSessionStore.getState().loadQueuedInputs('session-a')

    expect(useSessionStore.getState().queuedInputsBySessionId).toEqual({
      'session-a': [queuedInput],
    })
  })

  it('removes queued inputs from the visible list when they are sent', () => {
    const queuedInput = {
      id: 'queued-1',
      sessionId: 'session-a',
      deliveryMode: 'follow-up' as const,
      state: 'queued' as const,
      text: 'after this',
      attachmentIds: [],
      skillSelections: [],
      providerRequestId: null,
      error: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    useSessionStore.getState().handleQueuedInputPatched({
      sessionId: 'session-a',
      op: 'add',
      item: queuedInput,
    })
    useSessionStore.getState().handleQueuedInputPatched({
      sessionId: 'session-a',
      op: 'patch',
      item: {
        ...queuedInput,
        state: 'sent',
        updatedAt: '2026-01-01T00:00:01.000Z',
      },
    })

    expect(useSessionStore.getState().queuedInputsBySessionId).toEqual({
      'session-a': [],
    })
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
    mockElectronAPI.session.getSummariesByProjectId.mockResolvedValueOnce([])

    await useSessionStore.getState().deleteSession('session-1', 'project-1')

    expect(useSessionStore.getState().recentSessionIds).toEqual(['session-2'])
    expect(mockElectronAPI.session.setRecentIds).toHaveBeenCalledWith([
      'session-2',
    ])
  })

  describe('fork actions', () => {
    const sampleSummary = {
      topic: 'Auth refactor',
      decisions: [],
      open_questions: [],
      key_facts: [],
      artifacts: {
        urls: [],
        file_paths: [],
        repos: [],
        commands: [],
        identifiers: [],
      },
      next_steps: [],
    }

    it('previewFork delegates to the api and returns the summary', async () => {
      mockElectronAPI.session.forkPreviewSummary.mockResolvedValueOnce(
        sampleSummary,
      )
      const summary = await useSessionStore.getState().previewFork('parent-id')
      expect(mockElectronAPI.session.forkPreviewSummary).toHaveBeenCalledWith(
        'parent-id',
        undefined,
      )
      expect(summary.topic).toBe('Auth refactor')
    })

    it('previewFork surfaces errors as rejected promises', async () => {
      mockElectronAPI.session.forkPreviewSummary.mockRejectedValueOnce(
        new Error('boom'),
      )
      await expect(
        useSessionStore.getState().previewFork('parent-id'),
      ).rejects.toThrow('boom')
    })

    it('forkFull inserts the child and activates it', async () => {
      const child = makeSession({ id: 'child-1' })
      mockElectronAPI.session.forkFull.mockResolvedValueOnce(child)
      useSessionStore.setState({ currentProjectId: 'project-1' })

      const result = await useSessionStore.getState().forkFull({
        strategy: 'full',
        parentSessionId: 'parent-1',
        name: 'Fork',
        providerId: 'claude-code',
        modelId: 'sonnet',
        effort: null,
        workspaceMode: 'reuse',
        workspaceBranchName: null,
        additionalInstruction: null,
      })

      expect(result.id).toBe('child-1')
      const state = useSessionStore.getState()
      expect(state.sessions[0]?.id).toBe('child-1')
      expect(state.globalSessions[0]?.id).toBe('child-1')
      expect(state.activeSessionId).toBe('child-1')
      expect(state.recentSessionIds).toEqual(['child-1'])
    })

    it('forkFull keeps project list untouched when child belongs elsewhere', async () => {
      const child = makeSession({ id: 'child-9', projectId: 'project-2' })
      mockElectronAPI.session.forkFull.mockResolvedValueOnce(child)
      useSessionStore.setState({ currentProjectId: 'project-1', sessions: [] })

      await useSessionStore.getState().forkFull({
        strategy: 'full',
        parentSessionId: 'parent-1',
        name: 'Fork',
        providerId: 'claude-code',
        modelId: 'sonnet',
        effort: null,
        workspaceMode: 'reuse',
        workspaceBranchName: null,
        additionalInstruction: null,
      })

      const state = useSessionStore.getState()
      expect(state.sessions).toEqual([])
      expect(state.globalSessions[0]?.id).toBe('child-9')
    })

    it('forkSummary inserts the child and activates it', async () => {
      const child = makeSession({ id: 'child-sum' })
      mockElectronAPI.session.forkSummary.mockResolvedValueOnce(child)
      useSessionStore.setState({ currentProjectId: 'project-1' })

      const result = await useSessionStore.getState().forkSummary({
        strategy: 'summary',
        parentSessionId: 'parent-1',
        name: 'Fork',
        providerId: 'claude-code',
        modelId: 'sonnet',
        effort: null,
        workspaceMode: 'reuse',
        workspaceBranchName: null,
        additionalInstruction: null,
        seedMarkdown: '# seed',
      })

      expect(result.id).toBe('child-sum')
      expect(useSessionStore.getState().activeSessionId).toBe('child-sum')
      expect(mockElectronAPI.session.forkSummary).toHaveBeenCalledWith(
        expect.objectContaining({ seedMarkdown: '# seed' }),
      )
    })

    it('forkSummary surfaces errors as rejected promises', async () => {
      mockElectronAPI.session.forkSummary.mockRejectedValueOnce(
        new Error('nope'),
      )
      await expect(
        useSessionStore.getState().forkSummary({
          strategy: 'summary',
          parentSessionId: 'parent-1',
          name: 'Fork',
          providerId: 'claude-code',
          modelId: 'sonnet',
          effort: null,
          workspaceMode: 'reuse',
          workspaceBranchName: null,
          additionalInstruction: null,
          seedMarkdown: '# seed',
        }),
      ).rejects.toThrow('nope')
    })
  })
})
