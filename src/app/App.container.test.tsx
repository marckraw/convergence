import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSessionStore } from '@/entities/session'
import { App } from './App.container'

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: { error: vi.fn() },
}))

const mockProject = {
  id: '1',
  name: 'my-project',
  repositoryPath: '/tmp/my-project',
  settings: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
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
    getAll: vi.fn().mockResolvedValue([]),
    getByProjectId: vi.fn().mockResolvedValue([]),
    getById: vi.fn(),
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
    onSessionUpdate: vi.fn().mockReturnValue(() => {}),
  },
  appSettings: {
    get: vi.fn().mockResolvedValue({
      defaultProviderId: null,
      defaultModelId: null,
      defaultEffortId: null,
    }),
    set: vi.fn().mockImplementation(async (input) => input),
    onUpdated: vi.fn().mockReturnValue(() => {}),
  },
  provider: {
    getAll: vi.fn().mockResolvedValue([
      {
        id: 'claude-code',
        name: 'Claude Code',
        vendorLabel: 'Anthropic',
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
      },
    ]),
  },
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      needsYouDismissals: {},
      currentProjectId: null,
      activeSessionId: null,
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
