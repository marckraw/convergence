import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { parallelWorkApi } from './parallel-work.api'
import { useTaskOutputTail } from './use-task-output-tail'

vi.mock('./parallel-work.api', () => ({
  parallelWorkApi: { readTaskOutput: vi.fn() },
}))

const output = (text: string) => ({
  kind: 'output' as const,
  text,
  status: 'running' as const,
  truncated: false,
  totalBytes: text.length,
  readAt: '2026-10-18T10:00:00.000Z',
})

it('fetches nothing until read, then holds the host’s answer — mutation read on mount turns red', async () => {
  vi.mocked(parallelWorkApi.readTaskOutput).mockReset()
  vi.mocked(parallelWorkApi.readTaskOutput).mockResolvedValue(output('a\n'))
  const { result } = renderHook(() => useTaskOutputTail('s', 't'))
  expect(result.current.view).toEqual({ kind: 'idle' })
  expect(parallelWorkApi.readTaskOutput).not.toHaveBeenCalled()

  await act(async () => result.current.read())

  expect(parallelWorkApi.readTaskOutput).toHaveBeenCalledWith('s', 't')
  expect(result.current.view).toEqual({
    kind: 'output',
    reading: output('a\n'),
  })
})

it('turns a refusal into its code and a thrown read into a failure with the IPC wrapper removed', async () => {
  vi.mocked(parallelWorkApi.readTaskOutput).mockReset()
  vi.mocked(parallelWorkApi.readTaskOutput)
    .mockResolvedValueOnce({ kind: 'refused', code: 'no-output' })
    .mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'session:readTaskOutput': Error: Remote execution host is unreachable",
      ),
    )
  const { result } = renderHook(() => useTaskOutputTail('s', 't'))

  await act(async () => result.current.read())
  expect(result.current.view).toEqual({ kind: 'refused', code: 'no-output' })

  await act(async () => result.current.read())
  expect(result.current.view).toEqual({
    kind: 'failed',
    message: 'Remote execution host is unreachable',
  })
})

it('drops an answer that lands after the person moved to another task — mutation apply a stale answer turns red', async () => {
  vi.mocked(parallelWorkApi.readTaskOutput).mockReset()
  let land!: (value: ReturnType<typeof output>) => void
  vi.mocked(parallelWorkApi.readTaskOutput).mockReturnValue(
    new Promise((resolve) => {
      land = resolve
    }),
  )
  const { result, rerender } = renderHook(
    ({ taskId }) => useTaskOutputTail('s', taskId),
    { initialProps: { taskId: 'old' } },
  )
  let pending!: Promise<void>
  act(() => {
    pending = result.current.read()
  })
  expect(result.current.view).toEqual({ kind: 'loading' })

  rerender({ taskId: 'new' })
  await act(async () => {
    land(output('from the old task\n'))
    await pending
  })

  expect(result.current.view).toEqual({ kind: 'idle' })
})
