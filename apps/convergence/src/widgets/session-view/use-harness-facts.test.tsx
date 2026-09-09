import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { useHarnessFacts } from './use-harness-facts'
import { harnessFactsApi } from './harness-facts.api'
const summarySubscribe = vi.hoisted(() => vi.fn())
vi.mock('./harness-facts.api', () => ({
  harnessFactsApi: {
    read: vi.fn(),
    subscribe: vi.fn(),
    subscribeSummary: summarySubscribe,
  },
}))
const empty: SessionHarnessFacts = {
  turns: [],
  currentTurn: null,
  compactions: [],
  rateLimit: null,
  init: null,
}
beforeEach(() => vi.resetAllMocks())
it('R3prime only a coalesced fact flush rereads — mutation restore summary subscription turns red', async () => {
  const flushes: Array<(e: { sessionId: string }) => void> = [],
    summaries: Array<(e: { sessionId: string }) => void> = [],
    off = vi.fn()
  vi.mocked(harnessFactsApi.subscribe).mockImplementation((cb) => {
    flushes.push(cb)
    return off
  })
  summarySubscribe.mockImplementation((cb) => {
    summaries.push(cb)
    return off
  })
  vi.mocked(harnessFactsApi.read).mockResolvedValue(empty)
  const { result, unmount } = renderHook(() => useHarnessFacts('s'))
  await act(async () => {})
  for (let n = 0; n < 3; n++)
    await act(async () => summaries.forEach((cb) => cb({ sessionId: 's' })))
  const afterSummaries = vi.mocked(harnessFactsApi.read).mock.calls.length
  await act(async () => flushes.forEach((cb) => cb({ sessionId: 'other' })))
  await act(async () => flushes.forEach((cb) => cb({ sessionId: 's' })))
  const afterFlush = vi.mocked(harnessFactsApi.read).mock.calls.length
  unmount()
  expect({
    afterSummaries,
    afterFlush,
    off: off.mock.calls.length,
    facts: result.current.facts,
  }).toEqual({ afterSummaries: 1, afterFlush: 2, off: 1, facts: empty })
})
it('rejects stale reads and retries a failed read — mutations accept stale session or swallow read failure turn red', async () => {
  vi.mocked(harnessFactsApi.subscribe).mockReturnValue(() => {})
  summarySubscribe.mockReturnValue(() => {})
  let resolve!: (value: SessionHarnessFacts) => void
  vi.mocked(harnessFactsApi.read)
    .mockReturnValueOnce(
      new Promise((r) => {
        resolve = r
      }),
    )
    .mockRejectedValueOnce(Error('Read unavailable'))
    .mockResolvedValue(empty)
  const { result, rerender } = renderHook(({ id }) => useHarnessFacts(id), {
    initialProps: { id: 'old' },
  })
  await act(async () => {})
  await act(async () => rerender({ id: 'new' }))
  await act(async () =>
    resolve({
      ...empty,
      compactions: [
        {
          kind: 'harness.compaction',
          sequence: 1,
          at: 'old',
          trigger: null,
          preTokens: null,
          postTokens: null,
          durationMs: null,
        },
      ],
    }),
  )
  const failed = {
    facts: result.current.facts,
    error: result.current.error,
    loading: result.current.loading,
  }
  await act(async () => result.current.retry())
  expect({
    failed,
    recovered: result.current.facts,
    error: result.current.error,
  }).toEqual({
    failed: { facts: null, error: 'Read unavailable', loading: false },
    recovered: empty,
    error: null,
  })
})
