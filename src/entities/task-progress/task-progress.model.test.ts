import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TASK_PROGRESS_EVICTION_GRACE_MS,
  __setEvictScheduler,
  useTaskProgressStore,
} from './task-progress.model'

describe('task-progress store', () => {
  beforeEach(() => {
    useTaskProgressStore.setState({ snapshots: {} })
    __setEvictScheduler(null)
  })

  afterEach(() => {
    __setEvictScheduler(null)
  })

  it('creates a snapshot on `started` and accumulates chunk bytes', () => {
    const { ingest } = useTaskProgressStore.getState()
    ingest({ requestId: 'r1', kind: 'started', at: 1000 })
    ingest({ requestId: 'r1', kind: 'stdout-chunk', at: 1500, bytes: 42 })
    ingest({ requestId: 'r1', kind: 'stderr-chunk', at: 1600, bytes: 5 })

    const snap = useTaskProgressStore.getState().snapshots.r1
    expect(snap).toMatchObject({
      startedAt: 1000,
      lastEventAt: 1600,
      stdoutBytes: 42,
      stderrBytes: 5,
      settled: null,
    })
  })

  it('records the settled outcome on `settled`', () => {
    const { ingest } = useTaskProgressStore.getState()
    ingest({ requestId: 'r2', kind: 'started', at: 1000 })
    ingest({ requestId: 'r2', kind: 'settled', at: 2500, outcome: 'timeout' })

    const snap = useTaskProgressStore.getState().snapshots.r2
    expect(snap?.settled).toEqual({ at: 2500, outcome: 'timeout' })
  })

  it('keeps snapshots isolated per requestId', () => {
    const { ingest } = useTaskProgressStore.getState()
    ingest({ requestId: 'a', kind: 'started', at: 100 })
    ingest({ requestId: 'b', kind: 'started', at: 200 })
    ingest({ requestId: 'a', kind: 'stdout-chunk', at: 150, bytes: 10 })

    const snaps = useTaskProgressStore.getState().snapshots
    expect(snaps.a?.stdoutBytes).toBe(10)
    expect(snaps.b?.stdoutBytes).toBe(0)
  })

  it('schedules eviction only on settled and removes the snapshot after the grace window', () => {
    const scheduler = vi.fn<(requestId: string, delayMs: number) => void>()
    __setEvictScheduler(scheduler)

    const { ingest } = useTaskProgressStore.getState()
    ingest({ requestId: 'r3', kind: 'started', at: 1000 })
    ingest({ requestId: 'r3', kind: 'stdout-chunk', at: 1100, bytes: 1 })
    expect(scheduler).not.toHaveBeenCalled()

    ingest({ requestId: 'r3', kind: 'settled', at: 2000, outcome: 'ok' })
    expect(scheduler).toHaveBeenCalledWith(
      'r3',
      TASK_PROGRESS_EVICTION_GRACE_MS,
    )

    expect(useTaskProgressStore.getState().snapshots.r3).toBeDefined()
    useTaskProgressStore.getState().evict('r3')
    expect(useTaskProgressStore.getState().snapshots.r3).toBeUndefined()
  })

  it('drives eviction through real timers when no scheduler is injected', () => {
    vi.useFakeTimers()
    try {
      const { ingest } = useTaskProgressStore.getState()
      ingest({ requestId: 'r4', kind: 'started', at: 1000 })
      ingest({ requestId: 'r4', kind: 'settled', at: 2000, outcome: 'ok' })

      expect(useTaskProgressStore.getState().snapshots.r4).toBeDefined()
      vi.advanceTimersByTime(TASK_PROGRESS_EVICTION_GRACE_MS - 1)
      expect(useTaskProgressStore.getState().snapshots.r4).toBeDefined()
      vi.advanceTimersByTime(1)
      expect(useTaskProgressStore.getState().snapshots.r4).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('evict is a no-op when the snapshot is already gone', () => {
    const before = useTaskProgressStore.getState().snapshots
    useTaskProgressStore.getState().evict('nope')
    expect(useTaskProgressStore.getState().snapshots).toBe(before)
  })
})
