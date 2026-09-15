import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import { useMissionControlCards } from './use-mission-control-cards'
import { EMPTY_SESSION_CARD_FILTER } from './session-card-filter.pure'

const fixture = vi.hoisted(() => ({
  sessions: [] as SessionSummary[],
  providers: [],
  projects: [],
  crews: [],
  loadProviders: vi.fn(),
}))
vi.mock('@/entities/session', () => ({
  selectLocalProviders: () => fixture.providers,
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      globalSessions: fixture.sessions,
      loadProviders: fixture.loadProviders,
    }),
}))
vi.mock('@/entities/project', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({ projects: fixture.projects }),
}))
vi.mock('@/entities/session-crew', () => ({
  useSessionCrewStore: (selector: (state: unknown) => unknown) =>
    selector({ crews: fixture.crews }),
}))
const START = Date.parse('2026-09-15T12:00:00Z')
function remote(at: number): SessionSummary {
  return {
    id: 'remote',
    name: 'Horse',
    status: 'running',
    attention: 'none',
    activity: null,
    providerId: 'codex',
    contextKind: 'global',
    executionHost: 'lm',
    executionHostLastEventAt: new Date(at).toISOString(),
    updatedAt: new Date(START).toISOString(),
  } as SessionSummary
}
afterEach(() => {
  fixture.sessions = []
  vi.useRealTimers()
})
it('RUN84 lap3 clock refreshes when a remote card arrives — mutation omit immediate tick turns red', () => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  const { result, rerender, unmount } = renderHook(() =>
    useMissionControlCards({ filter: EMPTY_SESSION_CARD_FILTER }),
  )
  vi.setSystemTime(START + 3_600_000)
  fixture.sessions = [remote(START + 3_600_000 - 180_000)]
  rerender()
  expect(result.current.cards[0].hostLiveness).toBe('host · 3m ago')
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it('RUN84 lap3 clock uses minute cadence and stops when empty — mutation tick every second turns red', () => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  fixture.sessions = [remote(START - 90_000)]
  const { result, rerender, unmount } = renderHook(() =>
    useMissionControlCards({ filter: EMPTY_SESSION_CARD_FILTER }),
  )
  const cards = result.current.cards
  act(() => vi.advanceTimersByTime(59_000))
  expect(result.current.cards).toBe(cards)
  act(() => vi.advanceTimersByTime(1_000))
  expect(result.current.cards[0].hostLiveness).toBe('host · 2m ago')
  fixture.sessions = []
  rerender()
  expect(vi.getTimerCount()).toBe(0)
  unmount()
})
