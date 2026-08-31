import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectLocalProviders, useSessionStore } from './session.model'
import {
  catalogInForce,
  localProviderCatalogs,
  providerCatalogSourceForHost,
} from './provider-catalog.pure'

const mockElectronAPI = {
  session: {
    create: vi.fn(),
    getAllSummaries: vi.fn(),
    getGlobalSummaries: vi.fn(),
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
    getAll: vi.fn().mockResolvedValue({
      executionHostId: 'local',
      providers: [],
      unreachableReason: null,
    }),
  },
  executionHost: {
    getProjects: vi.fn().mockResolvedValue({
      executionHostId: 'local',
      supported: false,
      projects: [],
      unreachableReason: null,
    }),
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
    contextKind: 'project' as const,
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

function makeConversationItem(overrides: {
  id: string
  sequence: number
  text?: string
}) {
  return {
    id: overrides.id,
    sessionId: 'session-1',
    sequence: overrides.sequence,
    turnId: 'turn-1',
    kind: 'message' as const,
    state: 'complete' as const,
    actor: 'assistant' as const,
    text: overrides.text ?? `Message ${overrides.sequence}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: {
      providerId: 'claude-code',
      providerItemId: null,
      providerEventType: 'assistant',
    },
  }
}

function makeGlobalSession(overrides: { id: string; updatedAt?: string }) {
  return {
    id: overrides.id,
    contextKind: 'global' as const,
    projectId: null,
    workspaceId: null,
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium' as const,
    name: `Global ${overrides.id}`,
    status: 'running' as const,
    attention: 'none' as const,
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp/global-sessions',
    archivedAt: null,
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
      globalChatSessions: [],
      activeGlobalConversation: [],
      activeGlobalConversationSessionId: null,
      queuedInputsBySessionId: {},
      needsYouDismissals: {},
      recentSessionIds: [],
      currentProjectId: null,
      activeSessionId: null,
      activeProjectSessionId: null,
      activeGlobalSessionId: null,
      draftWorkspaceId: null,
      providerCatalogs: {},
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
      providerCatalogs: {},
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
      providerCatalogs: {},
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

  it('loads global chat sessions independently from project sessions', async () => {
    const projectSession = makeSession({ id: 'project-session' })
    const globalSession = makeGlobalSession({ id: 'global-session' })
    mockElectronAPI.session.getGlobalSummaries.mockResolvedValueOnce([
      globalSession,
    ])
    useSessionStore.setState({
      currentProjectId: 'project-1',
      sessions: [projectSession],
      activeSessionId: projectSession.id,
      activeProjectSessionId: projectSession.id,
    })

    await useSessionStore.getState().loadGlobalChatSessions()

    expect(mockElectronAPI.session.getGlobalSummaries).toHaveBeenCalledOnce()
    expect(useSessionStore.getState().sessions).toEqual([projectSession])
    expect(useSessionStore.getState().globalChatSessions).toEqual([
      globalSession,
    ])
    expect(useSessionStore.getState().activeSessionId).toBe(projectSession.id)
  })

  it('creates and starts a global chat session without changing project selection', async () => {
    const projectSession = makeSession({ id: 'project-session' })
    const globalSession = makeGlobalSession({ id: 'global-session' })
    mockElectronAPI.session.create.mockResolvedValueOnce(globalSession)
    mockElectronAPI.session.start.mockResolvedValueOnce(undefined)
    mockElectronAPI.session.getConversation.mockResolvedValueOnce([])
    useSessionStore.setState({
      currentProjectId: 'project-1',
      sessions: [projectSession],
      activeSessionId: projectSession.id,
      activeProjectSessionId: projectSession.id,
    })

    const result = await useSessionStore
      .getState()
      .createAndStartGlobalSession({
        providerId: 'claude-code',
        model: 'sonnet',
        effort: 'medium',
        name: 'Global chat',
        message: 'Hello',
      })

    expect(result?.id).toBe('global-session')
    expect(mockElectronAPI.session.create).toHaveBeenCalledWith({
      contextKind: 'global',
      providerId: 'claude-code',
      model: 'sonnet',
      effort: 'medium',
      name: 'Global chat',
    })
    expect(mockElectronAPI.session.start).toHaveBeenCalledWith(
      'global-session',
      {
        text: 'Hello',
        attachmentIds: undefined,
        skillSelections: undefined,
        contextItemIds: undefined,
      },
    )
    const state = useSessionStore.getState()
    expect(state.activeSessionId).toBe(projectSession.id)
    expect(state.activeProjectSessionId).toBe(projectSession.id)
    expect(state.activeGlobalSessionId).toBe(globalSession.id)
    expect(state.globalChatSessions[0]?.id).toBe(globalSession.id)
    expect(state.globalSessions[0]?.id).toBe(globalSession.id)
  })

  it('preserves separate project and global active selections', () => {
    const projectSession = makeSession({ id: 'project-session' })
    const globalSession = makeGlobalSession({ id: 'global-session' })
    useSessionStore.setState({
      sessions: [projectSession],
      globalSessions: [projectSession, globalSession],
      globalChatSessions: [globalSession],
      activeSessionId: projectSession.id,
      activeProjectSessionId: projectSession.id,
    })

    useSessionStore.getState().setActiveGlobalSession(globalSession.id)

    expect(useSessionStore.getState().activeSessionId).toBe(projectSession.id)
    expect(useSessionStore.getState().activeProjectSessionId).toBe(
      projectSession.id,
    )
    expect(useSessionStore.getState().activeGlobalSessionId).toBe(
      globalSession.id,
    )

    useSessionStore.getState().setActiveSession(globalSession.id)

    expect(useSessionStore.getState().activeSessionId).toBe(projectSession.id)
    expect(useSessionStore.getState().activeGlobalSessionId).toBe(
      globalSession.id,
    )
  })

  it('upserts active conversation patches without reordering existing items', () => {
    const first = makeConversationItem({ id: 'item-1', sequence: 1 })
    const second = makeConversationItem({ id: 'item-2', sequence: 2 })
    useSessionStore.setState({
      activeSessionId: 'session-1',
      activeConversationSessionId: 'session-1',
      activeConversation: [first, second],
    })

    useSessionStore.getState().handleConversationPatched({
      sessionId: 'session-1',
      op: 'patch',
      item: makeConversationItem({
        id: 'item-2',
        sequence: 2,
        text: 'Updated second message',
      }),
    })

    expect(
      useSessionStore
        .getState()
        .activeConversation.map((item) => [
          item.id,
          item.kind === 'message' ? item.text : null,
        ]),
    ).toEqual([
      ['item-1', 'Message 1'],
      ['item-2', 'Updated second message'],
    ])
  })

  it('inserts out-of-order conversation adds by sequence', () => {
    useSessionStore.setState({
      activeSessionId: 'session-1',
      activeConversationSessionId: 'session-1',
      activeConversation: [
        makeConversationItem({ id: 'item-1', sequence: 1 }),
        makeConversationItem({ id: 'item-3', sequence: 3 }),
      ],
    })

    useSessionStore.getState().handleConversationPatched({
      sessionId: 'session-1',
      op: 'add',
      item: makeConversationItem({ id: 'item-2', sequence: 2 }),
    })

    expect(
      useSessionStore
        .getState()
        .activeConversation.map((item) => item.sequence),
    ).toEqual([1, 2, 3])
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
      providerCatalogs: {},
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
      providerCatalogs: {},
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
      providerCatalogs: {},
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

  it('deleteSession removes global sessions without requiring a project id', async () => {
    useSessionStore.setState({
      sessions: [makeSession({ id: 'project-session' })],
      globalSessions: [
        makeGlobalSession({ id: 'global-1' }),
        makeGlobalSession({ id: 'global-2' }),
      ],
      globalChatSessions: [
        makeGlobalSession({ id: 'global-1' }),
        makeGlobalSession({ id: 'global-2' }),
      ],
      activeGlobalSessionId: 'global-1',
      activeGlobalConversation: [
        makeConversationItem({ id: 'item-1', sequence: 1 }),
      ],
      activeGlobalConversationSessionId: 'global-1',
      recentSessionIds: ['global-1', 'project-session'],
      needsYouDismissals: {
        'global-1': {
          updatedAt: '2026-01-01T00:00:00.000Z',
          disposition: 'acknowledged',
        },
      },
    })

    await useSessionStore.getState().deleteSession('global-1', null)

    const state = useSessionStore.getState()
    expect(
      mockElectronAPI.session.getSummariesByProjectId,
    ).not.toHaveBeenCalled()
    expect(state.sessions).toEqual([makeSession({ id: 'project-session' })])
    expect(state.globalSessions.map((session) => session.id)).toEqual([
      'global-2',
    ])
    expect(state.globalChatSessions.map((session) => session.id)).toEqual([
      'global-2',
    ])
    expect(state.activeGlobalSessionId).toBeNull()
    expect(state.activeGlobalConversation).toEqual([])
    expect(state.activeGlobalConversationSessionId).toBeNull()
    expect(state.needsYouDismissals).toEqual({})
    expect(state.recentSessionIds).toEqual(['project-session'])
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
        seedAttachmentIds: [],
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
        seedAttachmentIds: [],
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
        seedAttachmentIds: [],
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
          seedAttachmentIds: [],
          seedMarkdown: '# seed',
        }),
      ).rejects.toThrow('nope')
    })
  })
})

describe('loadProviderCatalog (MAR-2682)', () => {
  const source = providerCatalogSourceForHost('daemon-a', [
    {
      id: 'daemon-a',
      label: 'kuba-vps',
      baseUrl: 'https://a.test',
      position: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      configurationEpoch: 0,
    },
  ])

  function descriptor(id: string, kind: 'conversation' | 'shell') {
    return {
      id,
      name: id,
      vendorLabel: id,
      kind,
      supportsContinuation: true,
      defaultModelId: '',
      modelOptions: [],
      attachments: {
        supportsImage: false,
        supportsPdf: false,
        supportsText: false,
        maxImageBytes: 0,
        maxPdfBytes: 0,
        maxTextBytes: 0,
        maxTotalBytes: 0,
      },
      midRunInput: {
        supportsAnswer: false,
        supportsNativeFollowUp: true,
        supportsAppQueuedFollowUp: false,
        supportsSteer: false,
        supportsInterrupt: true,
        defaultRunningMode: 'follow-up' as const,
      },
    }
  }

  beforeEach(() => {
    useSessionStore.setState({ providerCatalogs: {} })
  })

  it('asks the machine it was given, and files the answer under that machine', async () => {
    mockElectronAPI.provider.getAll.mockResolvedValueOnce({
      executionHostId: 'daemon-a',
      providers: [
        {
          descriptor: descriptor('claude-code', 'conversation'),
          blockedReason: null,
        },
      ],
      unreachableReason: null,
    })

    await useSessionStore.getState().loadProviderCatalog(source)

    expect(mockElectronAPI.provider.getAll).toHaveBeenCalledWith('daemon-a')
    const filed = useSessionStore.getState().providerCatalogs['daemon-a']
    expect(filed?.status).toBe('landed')
    // The source travels with it, which is what makes it refusable later.
    expect(filed?.source).toEqual(source)
  })

  it('keeps the shell provider out, so no conversation surface can pick it', () => {
    mockElectronAPI.provider.getAll.mockResolvedValueOnce({
      executionHostId: 'daemon-a',
      providers: [
        {
          descriptor: descriptor('claude-code', 'conversation'),
          blockedReason: null,
        },
        { descriptor: descriptor('shell', 'shell'), blockedReason: null },
      ],
      unreachableReason: null,
    })

    return useSessionStore
      .getState()
      .loadProviderCatalog(source)
      .then(() => {
        const filed = useSessionStore.getState().providerCatalogs['daemon-a']
        expect(
          filed?.status === 'landed' &&
            filed.providers.map((entry) => entry.descriptor.id),
        ).toEqual(['claude-code'])
      })
  })

  it('records a failure as a failure, with the source it failed about', async () => {
    // A machine that could not be asked is not a machine with no providers.
    mockElectronAPI.provider.getAll.mockRejectedValueOnce(new Error('no ipc'))

    await useSessionStore.getState().loadProviderCatalog(source)

    const filed = useSessionStore.getState().providerCatalogs['daemon-a']
    expect(filed).toEqual({ status: 'failed', source, reason: 'no ipc' })
  })

  it('marks the catalog pending against its own source before the round trip', async () => {
    let release: (value: unknown) => void = () => {}
    mockElectronAPI.provider.getAll.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )

    const inFlight = useSessionStore.getState().loadProviderCatalog(source)
    expect(useSessionStore.getState().providerCatalogs['daemon-a']).toEqual({
      status: 'pending',
      source,
    })

    release({
      executionHostId: 'daemon-a',
      providers: [],
      unreachableReason: null,
    })
    await inFlight
  })
})

describe('a credential rotation on one machine (MAR-2689 round 6)', () => {
  /**
   * The Endpoint as the renderer receives it, at one configuration epoch.
   *
   * The id and the base URL do not move: rotating a daemon token in Settings
   * changes neither, which is exactly why the renderer could not see it. Only
   * the epoch moves, and it is the whole difference the store has to act on.
   */
  function endpointAtEpoch(configurationEpoch: number) {
    return {
      id: 'daemon-a',
      label: 'kuba-vps',
      baseUrl: 'https://a.test',
      position: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      configurationEpoch,
    }
  }

  const underTokenA = providerCatalogSourceForHost('daemon-a', [
    endpointAtEpoch(0),
  ])
  const underTokenB = providerCatalogSourceForHost('daemon-a', [
    endpointAtEpoch(1),
  ])

  beforeEach(() => {
    useSessionStore.setState({
      providerCatalogs: {},
      remoteProjectCatalogs: {},
    })
    mockElectronAPI.provider.getAll.mockReset()
    mockElectronAPI.executionHost.getProjects.mockReset()
  })

  it('never lands one credential’s provider listing under the next one', async () => {
    // The S3 hole, closing (MAR-2682 shipped the option row against a source
    // that could not see a token). A listing read under token A arrives after
    // the rotation; the row must be showing B's, and A's must land nowhere.
    //
    // Mutation: drop `endpoint.configurationEpoch` from the joined
    // configuration in `providerCatalogSourceForHost`, and this goes red --
    // the two sources compare equal and A's listing overwrites B's.
    let releaseA: (value: unknown) => void = () => {}
    mockElectronAPI.provider.getAll
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseA = resolve
        }),
      )
      .mockResolvedValueOnce({
        executionHostId: 'daemon-a',
        providers: [],
        unreachableReason: 'token B answered',
      })

    const readingA = useSessionStore.getState().loadProviderCatalog(underTokenA)
    await useSessionStore.getState().loadProviderCatalog(underTokenB)

    releaseA({
      executionHostId: 'daemon-a',
      providers: [],
      unreachableReason: 'token A answered',
    })
    await readingA

    const filed = useSessionStore.getState().providerCatalogs['daemon-a']
    expect(filed?.source).toEqual(underTokenB)
    expect(filed?.status === 'landed' && filed.unreachableReason).toBe(
      'token B answered',
    )
    // And nothing about token A is readable for the machine in force.
    expect(
      catalogInForce(useSessionStore.getState().providerCatalogs, underTokenA),
    ).toBeNull()
  })

  it('never lands one credential’s Projects under the next one', async () => {
    // codex's round-5 finding, at the end the strip reads: a `/v0/projects`
    // answer read under token A must not become the list of places the
    // composer can mint a session in on token B. `/srv/private-to-a` is a
    // directory only the first credential could see.
    //
    // Mutation: drop `endpoint.configurationEpoch` from the joined
    // configuration in `providerCatalogSourceForHost`, and this goes red --
    // `/srv/private-to-a` lands under token B's source and the slot offers it.
    let releaseA: (value: unknown) => void = () => {}
    mockElectronAPI.executionHost.getProjects
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseA = resolve
        }),
      )
      .mockResolvedValueOnce({
        executionHostId: 'daemon-a',
        supported: true,
        projects: [
          {
            id: 'shared',
            name: 'shared',
            workingDirectory: '/srv/shared',
            origin: null,
          },
        ],
        unreachableReason: null,
      })

    const readingA = useSessionStore
      .getState()
      .loadRemoteProjectCatalog(underTokenA)
    await useSessionStore.getState().loadRemoteProjectCatalog(underTokenB)

    releaseA({
      executionHostId: 'daemon-a',
      supported: true,
      projects: [
        {
          id: 'private-to-a',
          name: 'private-to-a',
          workingDirectory: '/srv/private-to-a',
          origin: null,
        },
      ],
      unreachableReason: null,
    })
    await readingA

    const inForce = catalogInForce(
      useSessionStore.getState().remoteProjectCatalogs,
      underTokenB,
    )
    expect(
      inForce?.status === 'landed' &&
        inForce.projects.map((project) => project.workingDirectory),
    ).toEqual(['/srv/shared'])
    expect(
      catalogInForce(
        useSessionStore.getState().remoteProjectCatalogs,
        underTokenA,
      ),
    ).toBeNull()
  })
})

describe('selectLocalProviders (MAR-2682)', () => {
  it('returns the same array until a catalog actually lands', () => {
    // A zustand selector runs on every store write and its result is compared
    // by identity, so a fresh `.map()` here re-renders every provider-reading
    // surface on every unrelated session update. Run 16 spun the app on exactly
    // this shape, which is why the projection is cached rather than rebuilt.
    useSessionStore.setState({
      providerCatalogs: localProviderCatalogs([
        {
          id: 'claude-code',
          name: 'Claude Code',
          vendorLabel: 'Anthropic',
          kind: 'conversation',
          supportsContinuation: true,
          defaultModelId: 'sonnet',
          modelOptions: [],
          attachments: {
            supportsImage: false,
            supportsPdf: false,
            supportsText: false,
            maxImageBytes: 0,
            maxPdfBytes: 0,
            maxTextBytes: 0,
            maxTotalBytes: 0,
          },
          midRunInput: {
            supportsAnswer: false,
            supportsNativeFollowUp: true,
            supportsAppQueuedFollowUp: false,
            supportsSteer: false,
            supportsInterrupt: true,
            defaultRunningMode: 'follow-up',
          },
        },
      ]),
    })

    const first = selectLocalProviders(useSessionStore.getState())
    useSessionStore.setState({ error: 'something unrelated' })
    expect(selectLocalProviders(useSessionStore.getState())).toBe(first)

    // And an empty catalog is one array too, not a new `[]` each call.
    useSessionStore.setState({ providerCatalogs: {} })
    const empty = selectLocalProviders(useSessionStore.getState())
    expect(selectLocalProviders(useSessionStore.getState())).toBe(empty)
  })
})
