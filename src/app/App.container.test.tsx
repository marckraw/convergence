import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useProjectStore } from '@/entities/project'
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
  project: {
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    delete: vi.fn(),
    getActive: vi.fn(),
    setActive: vi.fn(),
  },
  dialog: {
    selectDirectory: vi.fn(),
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
    useProjectStore.setState({
      projects: [],
      activeProject: null,
      loading: false,
      error: null,
    })
  })

  it('shows welcome screen when no active project', async () => {
    mockElectronAPI.project.getActive.mockResolvedValue(null)
    mockElectronAPI.project.getAll.mockResolvedValue([])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Welcome to Convergence')).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    mockElectronAPI.project.getActive.mockReturnValue(new Promise(() => {}))

    render(<App />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows project view when project is active', async () => {
    mockElectronAPI.project.getActive.mockResolvedValue(mockProject)
    mockElectronAPI.project.getAll.mockResolvedValue([mockProject])

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('my-project')).toBeInTheDocument()
    })
    expect(screen.getByText('/tmp/my-project')).toBeInTheDocument()
  })
})
