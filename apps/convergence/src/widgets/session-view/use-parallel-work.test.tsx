import type { ConversationItem } from '@/entities/session'
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type {
  SessionAgentRun,
  SessionTask,
} from '@/shared/types/harness-evidence.types'
import { buildParallelWork } from '@/shared/lib/parallel-work.pure'
import { useParallelWork, useParallelWorkDetail } from './use-parallel-work'
import { parallelWorkApi } from './parallel-work.api'

vi.mock('./parallel-work.api', () => ({
  parallelWorkApi: { read: vi.fn(), subscribe: vi.fn(), readDetail: vi.fn() },
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
    ({ id }) => useParallelWork(id),
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
  const { result } = renderHook(() => useParallelWork('broken'))
  await act(async () => {})
  expect({
    loading: result.current.loading,
    hasRecord: result.current.hasRecord,
    error: result.current.error,
    rows: result.current.rows,
  }).toEqual({
    loading: false,
    hasRecord: false,
    error: 'Record unavailable',
    rows: [],
  })
})

it('MAR-3310 O0b R4 a nested agent stays nested when no loaded item holds its spawn — mutation the tree ignores parentRunId turns red', async () => {
  vi.mocked(parallelWorkApi.subscribe).mockReturnValue(() => {})
  vi.mocked(parallelWorkApi.read).mockResolvedValue({
    runs: [
      { id: 'parent', spawnedByItemId: 'parent-spawn', parentRunId: null },
      // The spawn item is older than any window: only the read knows it.
      { id: 'child', spawnedByItemId: 'child-spawn', parentRunId: 'parent' },
    ] as SessionAgentRun[],
    tasks: [],
  })
  const { result } = renderHook(() => useParallelWork('s'))
  await act(async () => {})
  expect(result.current.rows.map((row) => [row.id, row.parentId])).toEqual([
    ['parent', null],
    ['child', 'parent'],
  ])
})

const detailRow = (status: SessionAgentRun['status'], id = 'agent') =>
  buildParallelWork(
    [
      {
        id,
        sessionId: 's',
        spawnedByItemId: 'spawn',
        status,
      } as SessionAgentRun,
    ],
    [],
  )[0]!
const detailItem = (id: string) =>
  ({
    id,
    sequence: 1,
    kind: 'thinking',
    agentRunId: 'agent',
  }) as ConversationItem

it('MAR-3310 O0b R2 the detail reads the selected row by its ids, drops a reply for another selection or an older read, and rereads on a status change without blanking — mutations accept a late reply, serve another row’s reply, or key the read on selection only turn red', async () => {
  const pending: Array<{
    ids: string[]
    resolve: (items: ConversationItem[]) => void
  }> = []
  vi.mocked(parallelWorkApi.readDetail).mockImplementation(
    (_sessionId, ids) =>
      new Promise((resolve) => pending.push({ ids, resolve })),
  )
  const ids = () => result.current.items.map((item) => item.id)
  const { result, rerender } = renderHook(
    ({ row }) => useParallelWorkDetail('s', row),
    { initialProps: { row: detailRow('running') } },
  )
  // Select another row before the first reply lands; then it lands.
  rerender({ row: detailRow('running', 'other') })
  await act(async () => pending[0]!.resolve([detailItem('stale')]))
  const afterStale = ids()
  await act(async () => pending[1]!.resolve([detailItem('other-1')]))
  const afterOwn = ids()
  // The row finishes: read again, keep serving the last reply meanwhile.
  rerender({ row: detailRow('completed', 'other') })
  const whileRereading = ids()
  // It changes again before that read returns; the newer read lands first
  // and the older one late — the late one is not the row's latest word.
  rerender({ row: detailRow('failed', 'other') })
  await act(async () => pending[3]!.resolve([detailItem('other-3')]))
  await act(async () => pending[2]!.resolve([detailItem('other-2')]))
  const afterRace = ids()
  // Back to the first row: what `other` read is not this row's detail.
  rerender({ row: detailRow('running') })
  const afterReselect = ids()
  expect({
    reads: pending.map((read) => read.ids),
    afterStale,
    afterOwn,
    whileRereading,
    afterRace,
    afterReselect,
    none: renderHook(() => useParallelWorkDetail('s', undefined)).result.current
      .items,
  }).toEqual({
    reads: [['agent'], ['other'], ['other'], ['other'], ['agent']],
    afterStale: [],
    afterOwn: ['other-1'],
    whileRereading: ['other-1'],
    afterRace: ['other-3'],
    afterReselect: [],
    none: [],
  })
})

it('MAR-3310 O0b R2 a failed detail read is reported, not swallowed — mutation drop the error turns red', async () => {
  vi.mocked(parallelWorkApi.readDetail).mockRejectedValue(
    new Error('database is locked'),
  )
  const { result } = renderHook(() =>
    useParallelWorkDetail('s', detailRow('running')),
  )
  await act(async () => {})
  expect(result.current).toEqual({ items: [], error: 'database is locked' })
})

it('MAR-3310 F1e R4 an evidence event that changes nothing keeps the rows; a real change replaces them — mutation always store a new record turns red', async () => {
  const callbacks: Array<(event: { sessionId: string }) => void> = []
  vi.mocked(parallelWorkApi.subscribe).mockImplementation((callback) => {
    callbacks.push(callback)
    return () => {}
  })
  const task = (status: SessionTask['status']) =>
    ({
      taskId: 'stream-task',
      sessionId: 'streaming',
      taskType: 'monitor',
      status,
    }) as SessionTask
  vi.mocked(parallelWorkApi.read).mockImplementation(async () => ({
    runs: [],
    tasks: [task('running')],
  }))
  const { result } = renderHook(() => useParallelWork('streaming'))
  await act(async () => {})
  const first = result.current.rows
  // A streaming provider reports the same task on every tick.
  for (let tick = 0; tick < 5; tick += 1)
    await act(async () => callbacks.at(-1)!({ sessionId: 'streaming' }))
  const afterSameEvidence = result.current.rows
  vi.mocked(parallelWorkApi.read).mockImplementation(async () => ({
    runs: [],
    tasks: [task('completed')],
  }))
  await act(async () => callbacks.at(-1)!({ sessionId: 'streaming' }))
  expect({
    kept: afterSameEvidence === first,
    replaced: result.current.rows !== first,
    status: result.current.rows[0]?.task?.status,
  }).toEqual({ kept: true, replaced: true, status: 'completed' })
})
