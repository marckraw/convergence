import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useProjectStore } from './project.model'

const mockProject = {
  id: '1',
  name: 'test-repo',
  repositoryPath: '/tmp/test-repo',
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

describe('useProjectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [],
      activeProject: null,
      loading: false,
      error: null,
    })
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: mockElectronAPI },
      writable: true,
      configurable: true,
    })
  })

  it('starts with empty state', () => {
    const state = useProjectStore.getState()
    expect(state.projects).toEqual([])
    expect(state.activeProject).toBeNull()
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('loadActiveProject sets loading then resolves', async () => {
    mockElectronAPI.project.getActive.mockResolvedValue(mockProject)
    mockElectronAPI.project.getAll.mockResolvedValue([mockProject])

    await useProjectStore.getState().loadActiveProject()

    const state = useProjectStore.getState()
    expect(state.activeProject).toEqual(mockProject)
    expect(state.projects).toEqual([mockProject])
    expect(state.loading).toBe(false)
  })

  it('loadActiveProject handles null active project', async () => {
    mockElectronAPI.project.getActive.mockResolvedValue(null)
    mockElectronAPI.project.getAll.mockResolvedValue([])

    await useProjectStore.getState().loadActiveProject()

    const state = useProjectStore.getState()
    expect(state.activeProject).toBeNull()
    expect(state.projects).toEqual([])
  })

  it('createProject opens dialog and creates', async () => {
    mockElectronAPI.dialog.selectDirectory.mockResolvedValue('/tmp/new-repo')
    mockElectronAPI.project.create.mockResolvedValue(mockProject)
    mockElectronAPI.project.getAll.mockResolvedValue([mockProject])

    await useProjectStore.getState().createProject()

    expect(mockElectronAPI.dialog.selectDirectory).toHaveBeenCalled()
    expect(mockElectronAPI.project.create).toHaveBeenCalledWith({
      repositoryPath: '/tmp/new-repo',
    })
    expect(useProjectStore.getState().activeProject).toEqual(mockProject)
  })

  it('createProject does nothing when dialog cancelled', async () => {
    mockElectronAPI.dialog.selectDirectory.mockResolvedValue(null)

    await useProjectStore.getState().createProject()

    expect(mockElectronAPI.project.create).not.toHaveBeenCalled()
  })

  it('createProject keeps the current active project when the repo already exists', async () => {
    const secondProject = {
      ...mockProject,
      id: '2',
      name: 'other-repo',
      repositoryPath: '/tmp/other-repo',
    }

    useProjectStore.setState({
      projects: [mockProject, secondProject],
      activeProject: secondProject,
      loading: false,
      error: null,
    })

    mockElectronAPI.dialog.selectDirectory.mockResolvedValue('/tmp/test-repo')
    mockElectronAPI.project.create.mockResolvedValue(mockProject)
    mockElectronAPI.project.getAll.mockResolvedValue([
      mockProject,
      secondProject,
    ])

    await useProjectStore.getState().createProject()

    expect(useProjectStore.getState().activeProject).toEqual(secondProject)
  })

  it('createProject sets error on failure', async () => {
    mockElectronAPI.dialog.selectDirectory.mockResolvedValue('/bad/path')
    mockElectronAPI.project.create.mockRejectedValue(
      new Error('Not a git repository'),
    )

    await useProjectStore.getState().createProject()

    expect(useProjectStore.getState().error).toBe('Not a git repository')
  })

  it('clearError resets error to null', () => {
    useProjectStore.setState({ error: 'some error' })
    useProjectStore.getState().clearError()
    expect(useProjectStore.getState().error).toBeNull()
  })
})
