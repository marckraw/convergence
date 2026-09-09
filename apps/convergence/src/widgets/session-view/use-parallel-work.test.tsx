import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { SessionTask } from '@/shared/types/harness-evidence.types'
import { useParallelWork } from './use-parallel-work'
import { parallelWorkApi } from './parallel-work.api'

vi.mock('./parallel-work.api', () => ({
  parallelWorkApi: { read: vi.fn(), subscribe: vi.fn() },
}))

it('R1/R2 rereads evidence for its session and rejects a stale session read — mutations omit subscription or accept stale read turn red', async () => {
  let oldResolve!: (value: { runs: []; tasks: SessionTask[] }) => void
  const old = new Promise<{ runs: []; tasks: SessionTask[] }>((resolve) => {
    oldResolve = resolve
  })
  const callbacks: Array<(event: { sessionId: string }) => void> = []
  const unsubscribe = vi.fn()
  vi.mocked(parallelWorkApi.subscribe).mockImplementation((callback) => {
    callbacks.push(callback)
    return unsubscribe
  })
  const task = (taskId: string) =>
    ({
      taskId,
      sessionId: 'new',
      taskType: 'monitor',
      status: 'running',
    }) as SessionTask
  vi.mocked(parallelWorkApi.read)
    .mockReturnValueOnce(old)
    .mockResolvedValue({ runs: [], tasks: [task('current')] })
  const { result, rerender, unmount } = renderHook(
    ({ id }) => useParallelWork(id, []),
    { initialProps: { id: 'old' } },
  )
  await act(async () => rerender({ id: 'new' }))
  await act(async () => oldResolve({ runs: [], tasks: [task('stale')] }))
  const afterStale = result.current.rows.map((row) => row.id)
  vi.mocked(parallelWorkApi.read).mockResolvedValue({
    runs: [],
    tasks: [task('updated')],
  })
  await act(async () => {
    callbacks.at(-1)!({ sessionId: 'other' })
    callbacks.at(-1)!({ sessionId: 'new' })
  })
  const updated = result.current.rows.map((row) => row.id)
  unmount()
  expect({
    afterStale,
    updated,
    reads: vi.mocked(parallelWorkApi.read).mock.calls,
    unsubscribed: unsubscribe.mock.calls.length,
  }).toEqual({
    afterStale: ['current'],
    updated: ['updated'],
    reads: [['old'], ['new'], ['new']],
    unsubscribed: 2,
  })
})

it('M4/T10 a rejected read settles loading and reports the error — mutation leave loading tied to the record turns red', async () => {
  vi.mocked(parallelWorkApi.subscribe).mockReturnValue(() => {})
  vi.mocked(parallelWorkApi.read).mockRejectedValue(
    new Error('Record unavailable'),
  )
  const { result } = renderHook(() => useParallelWork('broken', []))
  await act(async () => {})
  expect({
    loading: result.current.loading,
    error: result.current.error,
    rows: result.current.rows,
  }).toEqual({ loading: false, error: 'Record unavailable', rows: [] })
})
