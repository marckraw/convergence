import type { SessionSettledListener } from '../session/session.types'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { PullRequestService } from './pull-request.service'
import { connectPullRequestRefresh } from './pull-request-refresh.service'

afterEach(() => vi.useRealTimers())
describe('PR refresh subscriptions (MAR-2978)', () => {
  it('refreshes the settled session and detaches (mutation: omit settle subscription)', async () => {
    let settled: SessionSettledListener | undefined
    const off = vi.fn()
    const source = {
      onPullRequestHint: vi.fn(() => () => {}),
      onSessionSettled: vi.fn((listener) => {
        settled = listener
        return off
      }),
    }
    const service = {
      refreshForSession: vi.fn().mockResolvedValue(null),
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as PullRequestService
    const disconnect = connectPullRequestRefresh(service, source, vi.fn())
    settled?.({
      sessionId: 'horse',
      status: 'completed',
      settledAt: '2026-09-12T12:00:00Z',
      relaysMuted: false,
      dispatchIds: [],
    })
    expect(service.refreshForSession).toHaveBeenCalledExactlyOnceWith('horse')
    disconnect()
    expect(off).toHaveBeenCalledTimes(1)
    expect(service.stop).toHaveBeenCalledTimes(1)
  })
})

it('logs a rejected refresh with its session id (mutation: swallow refresh rejection)', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const failure = new Error('lookup refused')
  let settled!: SessionSettledListener
  const source = {
    onSessionSettled: (listener: typeof settled) => {
      settled = listener
      return () => {}
    },
    onPullRequestHint: () => () => {},
  }
  const service = {
    refreshForSession: vi.fn().mockRejectedValue(failure),
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as PullRequestService
  const disconnect = connectPullRequestRefresh(service, source, vi.fn())
  settled({
    sessionId: 'horse',
    status: 'completed',
    settledAt: '2026-09-12T12:00:00Z',
    relaysMuted: false,
    dispatchIds: [],
  })
  await Promise.resolve()
  expect(log).toHaveBeenCalledWith(
    '[pull-request] refresh failed for horse',
    failure,
  )
  disconnect()
  log.mockRestore()
})
