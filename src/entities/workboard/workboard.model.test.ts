import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkboardStore } from './workboard.model'
import type { WorkboardSnapshot } from './workboard.types'

const snapshot: WorkboardSnapshot = {
  selectedRunId: 'run-1',
  trackerSources: [],
  candidates: [],
  projectGroups: [],
  activeRuns: [],
}

const mockElectronAPI = {
  workboard: {
    getSnapshot: vi.fn(),
    syncSources: vi.fn(),
    startRun: vi.fn(),
    stopRun: vi.fn(),
    onSnapshotUpdated: vi.fn(),
  },
}

describe('useWorkboardStore', () => {
  beforeEach(() => {
    useWorkboardStore.setState({
      snapshot: null,
      loading: false,
      operation: null,
      error: null,
      statusMessage: null,
    })
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: mockElectronAPI },
      writable: true,
      configurable: true,
    })
  })

  it('loads the Workboard snapshot', async () => {
    mockElectronAPI.workboard.getSnapshot.mockResolvedValue(snapshot)

    await useWorkboardStore.getState().loadSnapshot()

    expect(useWorkboardStore.getState().snapshot).toEqual(snapshot)
    expect(useWorkboardStore.getState().loading).toBe(false)
    expect(useWorkboardStore.getState().operation).toBeNull()
    expect(useWorkboardStore.getState().error).toBeNull()
  })

  it('records load errors', async () => {
    mockElectronAPI.workboard.getSnapshot.mockRejectedValue(new Error('boom'))

    await useWorkboardStore.getState().loadSnapshot()

    expect(useWorkboardStore.getState().snapshot).toBeNull()
    expect(useWorkboardStore.getState().loading).toBe(false)
    expect(useWorkboardStore.getState().operation).toBeNull()
    expect(useWorkboardStore.getState().error).toBe('boom')
  })

  it('applies pushed snapshots', () => {
    useWorkboardStore.getState().applySnapshot(snapshot)

    expect(useWorkboardStore.getState().snapshot).toEqual(snapshot)
  })

  it('syncs sources with a visible completion message', async () => {
    mockElectronAPI.workboard.syncSources.mockResolvedValue({
      ...snapshot,
      trackerSources: [
        {
          id: 'source-1',
          type: 'linear',
          name: 'Linear',
          status: 'connected',
          scope: 'labels convergence-loop',
          syncedAt: 'now',
          candidateCount: 1,
        },
      ],
      candidates: [
        {
          id: 'issue-1',
          trackerType: 'linear',
          trackerName: 'Linear',
          externalKey: 'MAR-1103',
          title: 'Ready issue',
          projectName: 'convergence',
          mappingStatus: 'mapped',
          mappingRule: 'Linear -> convergence',
          state: 'ready',
          priority: 'low',
          labels: ['convergence-loop', 'loop-ready'],
          estimate: 'Backlog',
          summary: '',
          updatedAt: 'now',
        },
      ],
    })

    const syncPromise = useWorkboardStore.getState().syncSources()

    expect(useWorkboardStore.getState().operation).toBe('syncing')

    await syncPromise

    expect(useWorkboardStore.getState().operation).toBeNull()
    expect(useWorkboardStore.getState().statusMessage).toContain(
      'Synced 1 tracker source',
    )
  })

  it('starts a Workboard run and applies the returned snapshot', async () => {
    mockElectronAPI.workboard.startRun.mockResolvedValue({
      runId: 'run-1',
      snapshot,
    })

    await useWorkboardStore.getState().startRun({
      projectId: 'p1',
      issueIds: ['issue-1'],
    })

    expect(mockElectronAPI.workboard.startRun).toHaveBeenCalledWith({
      projectId: 'p1',
      issueIds: ['issue-1'],
    })
    expect(useWorkboardStore.getState().snapshot).toEqual(snapshot)
  })
})
