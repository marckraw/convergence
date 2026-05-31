import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useProjectStore } from '@/entities/project'
import { useProjectScriptStore } from '@/entities/project-script'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSpaceStore } from '@/entities/space'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useAppSurfaceStore } from '@/entities/app-surface'
import { useCodeReviewStore } from '@/entities/code-review'
import { App } from './App.container'
import { DEFAULT_PROJECT_SETTINGS } from '@/entities/project'

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}))

const mockProject = {
  id: '1',
  name: 'my-project',
  repositoryPath: '/tmp/my-project',
  settings: DEFAULT_PROJECT_SETTINGS,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const otherProject = {
  ...mockProject,
  id: '2',
  name: 'other-project',
  repositoryPath: '/tmp/other-project',
}

function makeSessionSummary(
  overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id' | 'name'>,
): SessionSummary {
  const { id, name, ...rest } = overrides

  return {
    id,
    contextKind: 'project',
    projectId: '1',
    workspaceId: null,
    providerId: 'claude-code',
    model: 'sonnet',
    effort: 'medium',
    name,
    status: 'completed',
    attention: 'finished',
    activity: null,
    contextWindow: null,
    workingDirectory: '/tmp/my-project',
    archivedAt: null,
    parentSessionId: null,
    forkStrategy: null,
    primarySurface: 'conversation',
    continuationToken: null,
    lastSequence: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...rest,
  }
}

function getSidebarQueries() {
  const sidebar = document.querySelector('.app-sidebar-panel')
  if (!(sidebar instanceof HTMLElement)) {
    throw new Error('Sidebar panel not found')
  }
  return within(sidebar)
}

const mockElectronAPI = {
  system: {
    getInfo: vi.fn().mockReturnValue({
      platform: 'darwin',
      prefersReducedTransparency: false,
    }),
  },
  project: {
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    delete: vi.fn(),
    getActive: vi.fn(),
    setActive: vi.fn(),
    updateSettings: vi.fn(),
  },
  dialog: { selectDirectory: vi.fn() },
  workspace: {
    create: vi.fn(),
    getByProjectId: vi.fn().mockResolvedValue([]),
    getAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  },
  projectScripts: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listRuns: vi.fn().mockResolvedValue([]),
    listActiveRuns: vi.fn().mockResolvedValue([]),
    getRun: vi.fn().mockResolvedValue(null),
    run: vi.fn(),
    stop: vi.fn(),
    onRunUpdated: vi.fn().mockReturnValue(() => {}),
    onRunOutput: vi.fn().mockReturnValue(() => {}),
  },
  space: {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listAttempts: vi.fn().mockResolvedValue([]),
    listAttemptsForSession: vi.fn().mockResolvedValue([]),
    linkAttempt: vi.fn(),
    updateAttempt: vi.fn(),
    unlinkAttempt: vi.fn(),
    setPrimaryAttempt: vi.fn(),
    listArtifacts: vi.fn().mockResolvedValue([]),
    addArtifact: vi.fn(),
    updateArtifact: vi.fn(),
    deleteArtifact: vi.fn(),
    listSources: vi.fn().mockResolvedValue([]),
    addSourcesFromPaths: vi.fn(),
    deleteSource: vi.fn(),
    showSourceOpenDialog: vi.fn(),
    synthesize: vi.fn(),
  },
  codeReview: {
    listTargets: vi.fn().mockResolvedValue([]),
    getSummary: vi.fn().mockResolvedValue({ base: null, files: [] }),
    getFilePatch: vi.fn().mockResolvedValue(''),
  },
  git: {
    getBranches: vi.fn().mockResolvedValue([]),
    getCurrentBranch: vi.fn().mockResolvedValue('main'),
  },
  session: {
    create: vi.fn(),
    getAllSummaries: vi.fn().mockResolvedValue([]),
    getGlobalSummaries: vi.fn().mockResolvedValue([]),
    getSummariesByProjectId: vi.fn().mockResolvedValue([]),
    getSummaryById: vi.fn().mockResolvedValue(null),
    getConversation: vi.fn().mockResolvedValue([]),
    getNeedsYouDismissals: vi.fn().mockResolvedValue({}),
    archive: vi.fn(),
    unarchive: vi.fn(),
    delete: vi.fn(),
    start: vi.fn(),
    sendMessage: vi.fn(),
    setNeedsYouDismissals: vi.fn().mockResolvedValue(undefined),
    approve: vi.fn(),
    deny: vi.fn(),
    stop: vi.fn(),
    getRecentIds: vi.fn().mockResolvedValue([]),
    setRecentIds: vi.fn().mockResolvedValue(undefined),
    getQueuedInputs: vi.fn().mockResolvedValue([]),
    cancelQueuedInput: vi.fn().mockResolvedValue(undefined),
    onSessionSummaryUpdate: vi.fn().mockReturnValue(() => {}),
    onSessionConversationPatched: vi.fn().mockReturnValue(() => {}),
    onSessionQueuedInputPatched: vi.fn().mockReturnValue(() => {}),
  },
  turns: {
    listForSession: vi.fn().mockResolvedValue([]),
    getFileChanges: vi.fn().mockResolvedValue([]),
    getFileDiff: vi.fn().mockResolvedValue(''),
    onTurnDelta: vi.fn().mockReturnValue(() => {}),
  },
  attachments: {
    getForSession: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    ingestFiles: vi.fn().mockResolvedValue({
      attachments: [],
      rejections: [],
    }),
    ingestFromPaths: vi.fn().mockResolvedValue({
      attachments: [],
      rejections: [],
    }),
    readBytes: vi.fn().mockResolvedValue(new Uint8Array()),
    delete: vi.fn().mockResolvedValue(undefined),
    showOpenDialog: vi.fn().mockResolvedValue([]),
  },
  appSettings: {
    get: vi.fn().mockResolvedValue({
      defaultProviderId: null,
      defaultModelId: null,
      defaultEffortId: null,
      namingModelByProvider: {},
      extractionModelByProvider: {},
      notifications: {
        enabled: true,
        toasts: true,
        sounds: true,
        system: true,
        dockBadge: true,
        dockBounce: true,
        events: {
          finished: true,
          needsInput: true,
          needsApproval: true,
          errored: true,
        },
        suppressWhenFocused: true,
      },
      onboarding: { notificationsCardDismissed: false },
      updates: { backgroundCheckEnabled: true },
      debugLogging: { enabled: false },
      piModelVisibility: { additionalModelIds: [] },
      favoriteModels: { items: [] },
    }),
    set: vi.fn().mockImplementation(async (input) => input),
    onUpdated: vi.fn().mockReturnValue(() => {}),
  },
  notifications: {
    getPrefs: vi.fn().mockResolvedValue({
      enabled: true,
      toasts: true,
      sounds: true,
      system: true,
      dockBadge: true,
      dockBounce: true,
      events: {
        finished: true,
        needsInput: true,
        needsApproval: true,
        errored: true,
      },
      suppressWhenFocused: true,
    }),
    setPrefs: vi.fn().mockImplementation(async (input) => input),
    testFire: vi.fn().mockResolvedValue(undefined),
    setActiveSession: vi.fn().mockResolvedValue(undefined),
    onPrefsUpdated: vi.fn().mockReturnValue(() => {}),
    onShowToast: vi.fn().mockReturnValue(() => {}),
    onPlaySound: vi.fn().mockReturnValue(() => {}),
    onFocusSession: vi.fn().mockReturnValue(() => {}),
    onClearUnread: vi.fn().mockReturnValue(() => {}),
  },
  provider: {
    getAll: vi.fn().mockResolvedValue([
      {
        id: 'claude-code',
        name: 'Claude Code',
        vendorLabel: 'Anthropic',
        kind: 'conversation',
        supportsContinuation: true,
        defaultModelId: 'sonnet',
        modelOptions: [
          {
            id: 'sonnet',
            label: 'Claude Sonnet',
            defaultEffort: 'medium',
            effortOptions: [
              { id: 'low', label: 'Low' },
              { id: 'medium', label: 'Medium' },
              { id: 'high', label: 'High' },
            ],
          },
        ],
        attachments: {
          supportsImage: true,
          supportsPdf: true,
          supportsText: true,
          maxImageBytes: 10 * 1024 * 1024,
          maxPdfBytes: 20 * 1024 * 1024,
          maxTextBytes: 1024 * 1024,
          maxTotalBytes: 50 * 1024 * 1024,
        },
        midRunInput: {
          supportsAnswer: false,
          supportsNativeFollowUp: false,
          supportsAppQueuedFollowUp: true,
          supportsSteer: false,
          supportsInterrupt: false,
          defaultRunningMode: 'follow-up',
        },
      },
    ]),
    getAllAvailable: vi.fn().mockResolvedValue([]),
    getStatuses: vi.fn().mockResolvedValue([]),
    getRuntimeInfo: vi.fn().mockResolvedValue({
      appNodeVersion: '24.15.0',
      electronVersion: '41.2.0',
      appVersion: '0.0.0',
      isPackaged: false,
      platform: 'darwin',
      arch: 'arm64',
    }),
    update: vi.fn().mockResolvedValue({
      ok: true,
      providerId: 'claude-code',
      command: 'claude update',
      stdout: '',
      stderr: '',
      error: null,
    }),
    onStatusesChanged: vi.fn().mockReturnValue(() => {}),
  },
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockElectronAPI.project.getActive.mockResolvedValue(null)
    mockElectronAPI.project.getAll.mockResolvedValue([])
    mockElectronAPI.workspace.getByProjectId.mockResolvedValue([])
    mockElectronAPI.workspace.getAll.mockResolvedValue([])
    mockElectronAPI.projectScripts.list.mockResolvedValue([])
    mockElectronAPI.projectScripts.listRuns.mockResolvedValue([])
    mockElectronAPI.projectScripts.listActiveRuns.mockResolvedValue([])
    mockElectronAPI.space.list.mockResolvedValue([])
    mockElectronAPI.space.listAttempts.mockResolvedValue([])
    mockElectronAPI.git.getBranches.mockResolvedValue([])
    mockElectronAPI.git.getCurrentBranch.mockResolvedValue('main')
    mockElectronAPI.session.getAllSummaries.mockResolvedValue([])
    mockElectronAPI.session.getGlobalSummaries.mockResolvedValue([])
    mockElectronAPI.session.getSummariesByProjectId.mockResolvedValue([])
    mockElectronAPI.session.getNeedsYouDismissals.mockResolvedValue({})
    mockElectronAPI.session.getRecentIds.mockResolvedValue([])
    mockElectronAPI.codeReview.listTargets.mockResolvedValue([])
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    })
    delete document.documentElement.dataset.platform
    delete document.documentElement.dataset.reducedTransparency
    useProjectStore.setState({
      projects: [],
      activeProject: null,
      loading: false,
      error: null,
    })
    useWorkspaceStore.setState({
      workspaces: [],
      currentBranch: null,
      loading: false,
      error: null,
    })
    useSessionStore.setState({
      sessions: [],
      globalSessions: [],
      globalChatSessions: [],
      activeGlobalConversation: [],
      activeGlobalConversationSessionId: null,
      queuedInputsBySessionId: {},
      needsYouDismissals: {},
      currentProjectId: null,
      activeSessionId: null,
      activeProjectSessionId: null,
      activeGlobalSessionId: null,
      draftWorkspaceId: null,
      providers: [],
      error: null,
    })
    useSpaceStore.setState({
      spaces: [],
      attemptsBySpaceId: {},
      attemptsBySessionId: {},
      artifactsBySpaceId: {},
      sourcesBySpaceId: {},
      loading: false,
      error: null,
    })
    useProjectScriptStore.setState({
      scriptsByProjectId: {},
      runsByProjectId: {},
      globalActiveRuns: [],
      outputByRunId: {},
      loading: false,
      error: null,
    })
    useAppSurfaceStore.setState({ activeSurface: 'code' })
    useCodeReviewStore.setState({
      isReviewOpen: false,
      selectedMode: 'working-tree',
      selectedFile: null,
      selectedTarget: null,
      targets: [],
      targetsLoading: false,
    })
  })

  it('shows welcome message when no project', async () => {
    mockElectronAPI.project.getActive.mockResolvedValue(null)
    mockElectronAPI.project.getAll.mockResolvedValue([])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Welcome to Convergence')).toBeInTheDocument()
    })
    expect(document.documentElement.dataset.platform).toBe('darwin')
    expect(document.documentElement.dataset.reducedTransparency).toBe('false')
  })

  it('opens the chat surface without requiring a project', async () => {
    mockElectronAPI.project.getActive.mockResolvedValue(null)
    mockElectronAPI.project.getAll.mockResolvedValue([])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Welcome to Convergence')).toBeInTheDocument()
    })

    const chatSurfaceButton = screen.getByRole('button', {
      name: 'Show chat surface',
    })
    expect(chatSurfaceButton.closest('.app-sidebar-topbar')).toBeNull()

    fireEvent.click(chatSurfaceButton)

    const sidebar = getSidebarQueries()

    expect(screen.queryByText('Convergence Chat')).not.toBeInTheDocument()
    expect(
      screen.getByText('Start a project-free agent conversation.'),
    ).toBeInTheDocument()
    expect(sidebar.getByText('No chats yet')).toBeInTheDocument()
    expect(sidebar.getByText('Spaces')).toBeInTheDocument()
    expect(
      sidebar.queryByRole('button', { name: /open a project/i }),
    ).toBeNull()
    expect(sidebar.queryByText('Project Settings')).toBeNull()
    fireEvent.pointerDown(
      sidebar.getByRole('button', { name: /open sidebar tools/i }),
    )
    expect(screen.getByText('Providers')).toBeInTheDocument()
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
    expect(screen.getAllByText('Skills').length).toBeGreaterThan(0)
    expect(screen.getByText('Prompt Library')).toBeInTheDocument()
  })

  it('opens a Space home from the Chat sidebar', async () => {
    mockElectronAPI.project.getActive.mockResolvedValue(null)
    mockElectronAPI.project.getAll.mockResolvedValue([])
    mockElectronAPI.space.list.mockResolvedValue([
      {
        id: 'space-1',
        title: 'Launch plan',
        status: 'exploring',
        attention: 'none',
        brief: 'Coordinate launch work.',
        memory: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Welcome to Convergence')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Show chat surface' }))

    const sidebar = getSidebarQueries()
    const spaceButton = await sidebar.findByRole('button', {
      name: /open space launch plan/i,
    })
    fireEvent.click(spaceButton)

    expect(screen.getByText('Space')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /chats/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Launch plan' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Coordinate launch work.')).toBeInTheDocument()
  })

  it('filters attention to global sessions in the chat surface', async () => {
    const projectSession = makeSessionSummary({
      id: 'project-session-1',
      name: 'Project Needs Review',
      contextKind: 'project',
      projectId: '1',
    })
    const globalSession = makeSessionSummary({
      id: 'global-session-1',
      name: 'Chat Needs Review',
      contextKind: 'global',
      projectId: null,
      workspaceId: null,
      workingDirectory: '/tmp/convergence/global',
    })
    mockElectronAPI.session.getAllSummaries.mockResolvedValue([
      projectSession,
      globalSession,
    ])
    mockElectronAPI.session.getGlobalSummaries.mockResolvedValue([
      globalSession,
    ])

    render(<App />)

    await waitFor(() => {
      expect(
        getSidebarQueries().getByText('Project Needs Review'),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Show chat surface' }))

    const sidebar = getSidebarQueries()
    expect(sidebar.getAllByText('Chat Needs Review').length).toBeGreaterThan(0)
    expect(sidebar.queryByText('Project Needs Review')).toBeNull()
  })

  it('opens a direct chat session route', async () => {
    const globalSession = makeSessionSummary({
      id: 'global-session-1',
      name: 'Route Chat',
      contextKind: 'global',
      projectId: null,
      workspaceId: null,
      workingDirectory: '/tmp/convergence/global',
    })
    mockElectronAPI.session.getGlobalSummaries.mockResolvedValue([
      globalSession,
    ])

    render(
      <App
        mainViewRoute={{ kind: 'chat-session', sessionId: 'global-session-1' }}
      />,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Route Chat').length).toBeGreaterThan(0)
    })
    expect(useAppSurfaceStore.getState().activeSurface).toBe('chat')
    expect(useSessionStore.getState().activeGlobalSessionId).toBe(
      'global-session-1',
    )
  })

  it('clears the active code session for a routed root draft', async () => {
    const routeSession = makeSessionSummary({
      id: 'session-1',
      name: 'Existing Session',
      projectId: mockProject.id,
    })
    mockElectronAPI.project.getActive.mockResolvedValue(mockProject)
    mockElectronAPI.project.getAll.mockResolvedValue([mockProject])
    mockElectronAPI.session.getAllSummaries.mockResolvedValue([routeSession])
    mockElectronAPI.session.getSummariesByProjectId.mockResolvedValue([
      routeSession,
    ])
    useSessionStore.setState({
      sessions: [routeSession],
      globalSessions: [routeSession],
      activeSessionId: 'session-1',
      activeProjectSessionId: 'session-1',
      activeConversationSessionId: 'session-1',
    })

    render(
      <App mainViewRoute={{ kind: 'new-code-session', workspaceId: null }} />,
    )

    await waitFor(() => {
      expect(useSessionStore.getState().activeSessionId).toBeNull()
    })
    expect(useSessionStore.getState().draftWorkspaceId).toBeNull()
    expect(
      await screen.findByText('What would you like to work on?'),
    ).toBeInTheDocument()
    expect(screen.getByText('Starting in main repo')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockElectronAPI.project.getActive.mockReturnValue(new Promise(() => {}))

    render(<App />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('falls back cleanly when system info is unavailable', async () => {
    mockElectronAPI.system.getInfo.mockReturnValueOnce(undefined)
    mockElectronAPI.project.getActive.mockResolvedValue(null)
    mockElectronAPI.project.getAll.mockResolvedValue([])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Welcome to Convergence')).toBeInTheDocument()
    })
    expect(document.documentElement.dataset.reducedTransparency).toBe('false')
  })

  it('shows sidebar with project when loaded', async () => {
    mockElectronAPI.project.getActive.mockResolvedValue(mockProject)
    mockElectronAPI.project.getAll.mockResolvedValue([mockProject])

    render(<App />)

    await waitFor(() => {
      expect(screen.getAllByText('my-project').length).toBeGreaterThan(0)
    })
  })

  it('clears the routed session view when selecting a project root', async () => {
    const routeSession = makeSessionSummary({
      id: 'session-1',
      name: 'Route Session',
      projectId: mockProject.id,
    })
    const onShowCodeHome = vi.fn(async () => undefined)
    mockElectronAPI.project.getActive.mockResolvedValue(mockProject)
    mockElectronAPI.project.getAll.mockResolvedValue([
      mockProject,
      otherProject,
    ])
    mockElectronAPI.project.getById.mockResolvedValue(otherProject)
    mockElectronAPI.project.setActive.mockResolvedValue(undefined)
    mockElectronAPI.session.getAllSummaries.mockResolvedValue([routeSession])
    mockElectronAPI.session.getSummariesByProjectId.mockImplementation(
      async (projectId: string) =>
        projectId === mockProject.id ? [routeSession] : [],
    )

    render(
      <App
        mainViewRoute={{ kind: 'code-session', sessionId: 'session-1' }}
        onShowCodeHome={onShowCodeHome}
      />,
    )

    fireEvent.click(
      await screen.findByRole('combobox', { name: /my-project/i }),
    )
    fireEvent.click(
      await screen.findByRole('option', { name: /other-project/i }),
    )

    await waitFor(() => {
      expect(onShowCodeHome).toHaveBeenCalledTimes(1)
      expect(mockElectronAPI.project.setActive).toHaveBeenCalledWith('2')
    })
    expect(useAppSurfaceStore.getState().activeSurface).toBe('code')
  })

  it('applies code review route search state to the review store', async () => {
    render(
      <App
        mainViewRoute={{
          kind: 'code-review',
          targetId: 'session:session-1',
          mode: 'base-branch',
          filePath: 'src/app.ts',
        }}
      />,
    )

    await waitFor(() => {
      expect(useCodeReviewStore.getState().isReviewOpen).toBe(true)
    })
    expect(useCodeReviewStore.getState().selectedMode).toBe('base-branch')
    expect(useCodeReviewStore.getState().selectedFile).toBe('src/app.ts')
  })

  it('shows a route fallback for an invalid code session route', async () => {
    render(
      <App mainViewRoute={{ kind: 'code-session', sessionId: 'missing' }} />,
    )

    expect(await screen.findByText('Session not found')).toBeInTheDocument()
    expect(screen.getByText(/points to a session/)).toBeInTheDocument()
  })

  it('shows a route fallback for an invalid Space route', async () => {
    render(
      <App
        mainViewRoute={{
          kind: 'chat-space',
          spaceId: 'missing-space',
          draftAttempt: false,
        }}
      />,
    )

    expect(await screen.findByText('Space not found')).toBeInTheDocument()
  })

  it('shows a route fallback for a stale Code Review target route', async () => {
    mockElectronAPI.project.getActive.mockResolvedValue(mockProject)
    mockElectronAPI.project.getAll.mockResolvedValue([mockProject])
    mockElectronAPI.codeReview.listTargets.mockResolvedValue([])

    render(
      <App
        mainViewRoute={{
          kind: 'code-review',
          targetId: 'missing-target',
          mode: 'working-tree',
          filePath: null,
        }}
      />,
    )

    expect(
      await screen.findByText('Review target unavailable'),
    ).toBeInTheDocument()
  })
})
