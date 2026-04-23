import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useWorkspaceStore } from './workspace.model'

const mockWorkspace = {
  id: 'ws-1',
  projectId: 'proj-1',
  branchName: 'feature-test',
  path: '/tmp/workspaces/proj-1/ws-1',
  type: 'worktree' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
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
  dialog: { selectDirectory: vi.fn() },
  workspace: {
    create: vi.fn(),
    getByProjectId: vi.fn(),
    getAll: vi.fn(),
    delete: vi.fn(),
  },
  git: {
    getBranches: vi.fn(),
    getCurrentBranch: vi.fn(),
  },
}

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspaces: [],
      globalWorkspaces: [],
      currentBranch: null,
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
    const state = useWorkspaceStore.getState()
    expect(state.workspaces).toEqual([])
    expect(state.currentBranch).toBeNull()
  })

  it('loadWorkspaces fetches and sets workspaces', async () => {
    mockElectronAPI.workspace.getByProjectId.mockResolvedValue([mockWorkspace])

    await useWorkspaceStore.getState().loadWorkspaces('proj-1')

    expect(useWorkspaceStore.getState().workspaces).toEqual([mockWorkspace])
  })

  it('loadCurrentBranch sets branch name', async () => {
    mockElectronAPI.git.getCurrentBranch.mockResolvedValue('main')

    await useWorkspaceStore.getState().loadCurrentBranch('/tmp/repo')

    expect(useWorkspaceStore.getState().currentBranch).toBe('main')
  })

  it('createWorkspace calls API and refreshes both lists', async () => {
    mockElectronAPI.workspace.create.mockResolvedValue(mockWorkspace)
    mockElectronAPI.workspace.getByProjectId.mockResolvedValue([mockWorkspace])
    mockElectronAPI.workspace.getAll.mockResolvedValue([mockWorkspace])

    await useWorkspaceStore
      .getState()
      .createWorkspace('proj-1', 'feature-test', 'develop')

    expect(mockElectronAPI.workspace.create).toHaveBeenCalledWith({
      projectId: 'proj-1',
      branchName: 'feature-test',
      baseBranch: 'develop',
    })
    expect(useWorkspaceStore.getState().workspaces).toEqual([mockWorkspace])
    expect(useWorkspaceStore.getState().globalWorkspaces).toEqual([
      mockWorkspace,
    ])
  })

  it('createWorkspace sets error on failure', async () => {
    mockElectronAPI.workspace.create.mockRejectedValue(
      new Error('branch already checked out'),
    )

    await useWorkspaceStore.getState().createWorkspace('proj-1', 'dup')

    expect(useWorkspaceStore.getState().error).toBe(
      'branch already checked out',
    )
  })

  it('deleteWorkspace calls API and refreshes both lists', async () => {
    useWorkspaceStore.setState({
      workspaces: [mockWorkspace],
      globalWorkspaces: [mockWorkspace],
    })
    mockElectronAPI.workspace.delete.mockResolvedValue(undefined)
    mockElectronAPI.workspace.getByProjectId.mockResolvedValue([])
    mockElectronAPI.workspace.getAll.mockResolvedValue([])

    await useWorkspaceStore.getState().deleteWorkspace('ws-1', 'proj-1')

    expect(mockElectronAPI.workspace.delete).toHaveBeenCalledWith('ws-1')
    expect(useWorkspaceStore.getState().workspaces).toEqual([])
    expect(useWorkspaceStore.getState().globalWorkspaces).toEqual([])
  })

  it('loadGlobalWorkspaces populates globalWorkspaces with every project', async () => {
    const otherProjectWorkspace = {
      ...mockWorkspace,
      id: 'ws-2',
      projectId: 'proj-2',
      branchName: 'other',
      path: '/tmp/workspaces/proj-2/ws-2',
    }
    mockElectronAPI.workspace.getAll.mockResolvedValue([
      mockWorkspace,
      otherProjectWorkspace,
    ])

    await useWorkspaceStore.getState().loadGlobalWorkspaces()

    expect(mockElectronAPI.workspace.getAll).toHaveBeenCalled()
    expect(useWorkspaceStore.getState().globalWorkspaces).toEqual([
      mockWorkspace,
      otherProjectWorkspace,
    ])
  })

  it('loadGlobalWorkspaces sets error on failure', async () => {
    mockElectronAPI.workspace.getAll.mockRejectedValue(new Error('disk down'))

    await useWorkspaceStore.getState().loadGlobalWorkspaces()

    expect(useWorkspaceStore.getState().error).toBe('disk down')
  })
})
