import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { useHarnessFacts } from './use-harness-facts'
import { harnessFactsApi } from './harness-facts.api'
vi.mock('./harness-facts.api', () => ({
  harnessFactsApi: {
    read: vi.fn(),
    subscribe: vi.fn(),
    subscribeSummary: vi.fn(),
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
it('refreshes from both existing broadcasts and coalesces one flush — mutations omit either subscription or microtask guard turn red', async () => {
  const listeners: Array<(e: { sessionId: string }) => void> = [],
    off = vi.fn()
  vi.mocked(harnessFactsApi.subscribe).mockImplementation((cb) => {
    listeners[0] = cb
    return off
  })
  vi.mocked(harnessFactsApi.subscribeSummary).mockImplementation((cb) => {
    listeners[1] = cb
    return off
  })
  vi.mocked(harnessFactsApi.read).mockResolvedValue(empty)
  const { result, unmount } = renderHook(() => useHarnessFacts('s'))
  await act(async () => {})
  await act(async () => {
    listeners[0]?.({ sessionId: 'other' })
    listeners[0]?.({ sessionId: 's' })
    listeners[1]?.({ sessionId: 's' })
  })
  const coalesced = vi.mocked(harnessFactsApi.read).mock.calls.length
  await act(async () => listeners[1]?.({ sessionId: 's' }))
  await act(async () => listeners[0]?.({ sessionId: 's' }))
  unmount()
  expect({
    coalesced,
    reads: vi.mocked(harnessFactsApi.read).mock.calls,
    facts: result.current.facts,
    loading: result.current.loading,
    off: off.mock.calls.length,
  }).toEqual({
    coalesced: 2,
    reads: [['s'], ['s'], ['s'], ['s']],
    facts: empty,
    loading: false,
    off: 2,
  })
})
it('rejects stale reads and retries a failed read — mutations accept stale session or swallow read failure turn red', async () => {
  vi.mocked(harnessFactsApi.subscribe).mockReturnValue(() => {})
  vi.mocked(harnessFactsApi.subscribeSummary).mockReturnValue(() => {})
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
