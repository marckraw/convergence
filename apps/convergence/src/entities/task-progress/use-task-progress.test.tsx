import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __setEvictScheduler,
  useTaskProgressStore,
} from './task-progress.model'
import { useTaskProgress } from './use-task-progress'

describe('useTaskProgress', () => {
  beforeEach(() => {
    useTaskProgressStore.setState({ snapshots: {} })
    __setEvictScheduler(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    __setEvictScheduler(null)
  })

  it('returns null when no requestId is given', () => {
    const { result } = renderHook(() => useTaskProgress(null))
    expect(result.current).toBeNull()
  })

  it('returns null when no snapshot exists for the id', () => {
    const { result } = renderHook(() => useTaskProgress('missing'))
    expect(result.current).toBeNull()
  })

  it('ticks elapsed time once per second until a settled event arrives', () => {
    vi.setSystemTime(10_000)
    const { ingest } = useTaskProgressStore.getState()
    act(() => {
      ingest({ requestId: 'r1', kind: 'started', at: 10_000 })
    })

    const { result } = renderHook(() => useTaskProgress('r1'))
    expect(result.current?.elapsedMs).toBe(0)
    expect(result.current?.settled).toBeNull()

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current?.elapsedMs).toBe(3000)

    act(() => {
      ingest({ requestId: 'r1', kind: 'settled', at: 15_000, outcome: 'ok' })
    })
    expect(result.current?.elapsedMs).toBe(5000)
    expect(result.current?.settled).toEqual({ at: 15_000, outcome: 'ok' })
  })

  it('reports msSinceLastEvent relative to the most recent chunk', () => {
    vi.setSystemTime(22_000)
    const { ingest } = useTaskProgressStore.getState()
    act(() => {
      ingest({ requestId: 'r2', kind: 'started', at: 20_000 })
      ingest({ requestId: 'r2', kind: 'stdout-chunk', at: 22_000, bytes: 1 })
    })

    const { result } = renderHook(() => useTaskProgress('r2'))

    act(() => {
      vi.advanceTimersByTime(8000)
    })
    expect(result.current?.msSinceLastEvent).toBe(8000)
    expect(result.current?.elapsedMs).toBe(10_000)
  })

  it('clears its interval on unmount', () => {
    const { ingest } = useTaskProgressStore.getState()
    act(() => {
      ingest({ requestId: 'r3', kind: 'started', at: 0 })
    })

    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useTaskProgress('r3'))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
  })
})
