import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { App } from './App.container'
import { DEFAULT_PROJECT_SETTINGS } from '@/entities/project'

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: { error: vi.fn() },
}))

const mockProject = {
  id: '1',
  name: 'my-project',
  repositoryPath: '/tmp/my-project',
  settings: DEFAULT_PROJECT_SETTINGS,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
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
    delete: vi.fn(),
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
  },
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockElectronAPI.project.getActive.mockResolvedValue(null)
    mockElectronAPI.project.getAll.mockResolvedValue([])
    mockElectronAPI.workspace.getByProjectId.mockResolvedValue([])
    mockElectronAPI.git.getBranches.mockResolvedValue([])
    mockElectronAPI.git.getCurrentBranch.mockResolvedValue('main')
    mockElectronAPI.session.getAllSummaries.mockResolvedValue([])
    mockElectronAPI.session.getGlobalSummaries.mockResolvedValue([])
    mockElectronAPI.session.getSummariesByProjectId.mockResolvedValue([])
    mockElectronAPI.session.getNeedsYouDismissals.mockResolvedValue({})
    mockElectronAPI.session.getRecentIds.mockResolvedValue([])
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

    expect(screen.getByText('Convergence Chat')).toBeInTheDocument()
    expect(sidebar.getByText('No chats yet')).toBeInTheDocument()
    expect(
      sidebar.queryByRole('button', { name: /open a project/i }),
    ).toBeNull()
    expect(sidebar.queryByText('Initiatives')).toBeNull()
    expect(sidebar.queryByText('Project Settings')).toBeNull()
    expect(sidebar.getByText('Providers')).toBeInTheDocument()
    expect(sidebar.getByText('MCP Servers')).toBeInTheDocument()
    expect(sidebar.getByText('Skills')).toBeInTheDocument()
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
      expect(screen.getByText('my-project')).toBeInTheDocument()
    })
  })
})
