import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { pullRequestApi } from '@/entities/pull-request'
import { useSessionPullRequest } from './pull-request-session.container'
import type { SessionPullRequestReading } from '@/shared/types/session-pull-request.types'
vi.mock('@/entities/pull-request', () => ({
  pullRequestApi: { getForSession: vi.fn(), refreshForSession: vi.fn() },
}))
const reading = (branchName: string): SessionPullRequestReading => ({
  pullRequest: null,
  branchName,
  message: null,
})
beforeEach(() => vi.resetAllMocks())
it('keeps the current session reading when an earlier refresh finishes late (mutation: one result slot)', async () => {
  vi.mocked(pullRequestApi.getForSession).mockImplementation(async (id) =>
    reading(id),
  )
  let finish!: (value: SessionPullRequestReading) => void
  vi.mocked(pullRequestApi.refreshForSession).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const { result, rerender } = renderHook(
    ({ id }) => useSessionPullRequest(id),
    { initialProps: { id: 'a' } },
  )
  await waitFor(() => expect(result.current.reading?.branchName).toBe('a'))
  act(() => {
    void result.current.refresh()
  })
  rerender({ id: 'b' })
  await waitFor(() => expect(result.current.reading?.branchName).toBe('b'))
  await act(async () => finish(reading('a')))
  expect(result.current.reading?.branchName).toBe('b')
})
it('reports a synchronous API failure without crashing the session (mutation: call outside try)', async () => {
  vi.mocked(pullRequestApi.getForSession).mockImplementation(() => {
    throw new Error('PR bridge unavailable')
  })
  const { result } = renderHook(() => useSessionPullRequest('a'))
  await waitFor(() =>
    expect(result.current.reading?.message).toBe('PR bridge unavailable'),
  )
})
