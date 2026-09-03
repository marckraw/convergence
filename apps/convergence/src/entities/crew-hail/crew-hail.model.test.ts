import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCrewHailStore } from './crew-hail.model'
import type { CrewHail } from './crew-hail.types'

function hail(overrides: Partial<CrewHail> & { id: string }): CrewHail {
  return {
    crewId: 'c1',
    flowRunId: 'run-1',
    reason: 'terminal',
    sessionId: 's1',
    baton: 'marcin',
    message: 'Your call.',
    detail: 'This station handed the work to you.',
    raisedAt: '2026-09-01T12:00:00.000Z',
    acknowledgedAt: null,
    ...overrides,
  }
}

type BroadcastCallback = (hails: CrewHail[]) => void

/**
 * The store's dependencies, with the one lever this file exists for: the
 * snapshot resolves only when the test says so, which is the window a hail
 * raised mid-load falls into.
 */
function installMockApi(snapshot: Promise<CrewHail[]>) {
  const listeners: BroadcastCallback[] = []
  const mock = {
    crewHail: {
      listOpen: vi.fn(() => snapshot),
      acknowledge: vi.fn().mockResolvedValue(undefined),
      acknowledgeCrew: vi.fn().mockResolvedValue(0),
      onUpdated: vi.fn((cb: BroadcastCallback) => {
        listeners.push(cb)
        return () => {
          const idx = listeners.indexOf(cb)
          if (idx >= 0) listeners.splice(idx, 1)
        }
      }),
    },
  }
  Object.defineProperty(globalThis, 'window', {
    value: { electronAPI: mock },
    writable: true,
    configurable: true,
  })
  return { mock, listeners }
}

describe('useCrewHailStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCrewHailStore.getState().unsubscribe?.()
    useCrewHailStore.setState({
      hails: [],
      isLoaded: false,
      error: null,
      unsubscribe: null,
    })
  })

  it('keeps a hail raised while the first list was still in flight', async () => {
    // The whole point of this store is that a parked loop is never silent.
    // Subscribing after the snapshot leaves a window where a hail is
    // broadcast to nobody and the stale list then commits over it — Mission
    // Control dark until reload, which is the silence this feature removes.
    let resolveSnapshot: (hails: CrewHail[]) => void = () => {}
    const snapshot = new Promise<CrewHail[]>((resolve) => {
      resolveSnapshot = resolve
    })
    const { listeners } = installMockApi(snapshot)

    const loading = useCrewHailStore.getState().load()
    listeners.forEach((cb) => cb([hail({ id: 'raised-mid-load' })]))
    resolveSnapshot([])
    await loading

    expect(useCrewHailStore.getState().hails.map((h) => h.id)).toEqual([
      'raised-mid-load',
    ])
    expect(useCrewHailStore.getState().isLoaded).toBe(true)
  })

  it('takes the snapshot when nothing was broadcast underneath it', async () => {
    const { listeners } = installMockApi(
      Promise.resolve([hail({ id: 'already-open' })]),
    )

    await useCrewHailStore.getState().load()

    expect(useCrewHailStore.getState().hails.map((h) => h.id)).toEqual([
      'already-open',
    ])
    expect(listeners).toHaveLength(1)
  })

  it('drops the previous subscription when it loads again', async () => {
    const { listeners } = installMockApi(Promise.resolve([]))

    await useCrewHailStore.getState().load()
    await useCrewHailStore.getState().load()

    expect(listeners).toHaveLength(1)
  })

  it('ignores an obsolete load whose snapshot resolves last', async () => {
    // Two overlapping loads: A subscribes and waits; B replaces it and hears
    // the broadcast; then A's older empty snapshot resolves. A never heard
    // the broadcast, so without a generation it would commit [] over the
    // live hail -- and nothing guarantees a later broadcast to repair it.
    let resolveA: (hails: CrewHail[]) => void = () => {}
    const snapshotA = new Promise<CrewHail[]>((resolve) => {
      resolveA = resolve
    })
    let resolveB: (hails: CrewHail[]) => void = () => {}
    const snapshotB = new Promise<CrewHail[]>((resolve) => {
      resolveB = resolve
    })
    const { mock, listeners } = installMockApi(snapshotA)
    mock.crewHail.listOpen
      .mockReturnValueOnce(snapshotA)
      .mockReturnValueOnce(snapshotB)

    const loadingA = useCrewHailStore.getState().load()
    const loadingB = useCrewHailStore.getState().load()
    listeners.forEach((cb) => cb([hail({ id: 'live' })]))
    resolveB([hail({ id: 'live' })])
    await loadingB
    resolveA([])
    await loadingA

    expect(useCrewHailStore.getState().hails.map((h) => h.id)).toEqual(['live'])
  })

  it('ignores an obsolete load whichever order the snapshots resolve in', async () => {
    // The same race with the newest snapshot resolving first, then the
    // oldest: the hail must survive both orders.
    let resolveA: (hails: CrewHail[]) => void = () => {}
    const snapshotA = new Promise<CrewHail[]>((resolve) => {
      resolveA = resolve
    })
    let resolveB: (hails: CrewHail[]) => void = () => {}
    const snapshotB = new Promise<CrewHail[]>((resolve) => {
      resolveB = resolve
    })
    const { mock, listeners } = installMockApi(snapshotA)
    mock.crewHail.listOpen
      .mockReturnValueOnce(snapshotA)
      .mockReturnValueOnce(snapshotB)

    const loadingA = useCrewHailStore.getState().load()
    const loadingB = useCrewHailStore.getState().load()
    resolveA([])
    await loadingA
    listeners.forEach((cb) => cb([hail({ id: 'live' })]))
    resolveB([])
    await loadingB

    expect(useCrewHailStore.getState().hails.map((h) => h.id)).toEqual(['live'])
  })

  it('does not let an obsolete load report its failure either', async () => {
    // An obsolete invocation is ignored ENTIRELY: its rejection is not the
    // current load's error any more than its snapshot is the current list.
    let rejectA: (err: Error) => void = () => {}
    const snapshotA = new Promise<CrewHail[]>((_, reject) => {
      rejectA = reject
    })
    const snapshotB = Promise.resolve([hail({ id: 'live' })])
    const { mock } = installMockApi(snapshotA)
    mock.crewHail.listOpen
      .mockReturnValueOnce(snapshotA)
      .mockReturnValueOnce(snapshotB)

    const loadingA = useCrewHailStore.getState().load()
    const loadingB = useCrewHailStore.getState().load()
    await loadingB
    rejectA(new Error('stale wire'))
    await loadingA

    expect(useCrewHailStore.getState().error).toBeNull()
    expect(useCrewHailStore.getState().hails.map((h) => h.id)).toEqual(['live'])
  })
})
