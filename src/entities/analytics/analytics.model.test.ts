import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnalyticsStore } from './analytics.model'
import type { AnalyticsOverview } from './analytics.types'

const overview: AnalyticsOverview = {
  range: { preset: '30d', startDate: '2026-04-01', endDate: '2026-04-30' },
  totals: {
    userMessages: 1,
    assistantMessages: 2,
    userWords: 3,
    assistantWords: 4,
    sessionsCreated: 5,
    turnsCompleted: 6,
    filesChanged: 7,
    linesAdded: 8,
    linesDeleted: 9,
    approvalRequests: 10,
    inputRequests: 11,
    attachmentsSent: 12,
    toolCalls: 13,
    failedSessions: 14,
  },
  streaks: { current: 2, longest: 4, activeDays: ['2026-04-29'] },
  dailyActivity: [],
  providerUsage: [],
  projectUsage: [],
  weekdayHourActivity: [],
  conversationBalance: [],
  deterministicProfile: {
    mostUsedProvider: null,
    mostActiveProject: null,
    peakActivity: null,
    sessionSizeBucket: 'quick-check',
    interactionShape: 'mostly-ask-review',
    summary: 'Based on local activity.',
  },
  generatedProfile: null,
}

function installMockApi(getOverview = vi.fn().mockResolvedValue(overview)): {
  getOverview: ReturnType<typeof vi.fn>
} {
  const mock = { analytics: { getOverview } }
  Object.defineProperty(globalThis, 'window', {
    value: { electronAPI: mock },
    writable: true,
    configurable: true,
  })
  return mock.analytics
}

describe('useAnalyticsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAnalyticsStore.setState({
      rangePreset: '30d',
      overview: null,
      isLoading: false,
      error: null,
    })
  })

  it('loads overview data for the current range', async () => {
    const api = installMockApi()

    await useAnalyticsStore.getState().loadOverview()

    expect(api.getOverview).toHaveBeenCalledWith('30d')
    expect(useAnalyticsStore.getState()).toMatchObject({
      rangePreset: '30d',
      overview,
      isLoading: false,
      error: null,
    })
  })

  it('loads overview data for an explicit range and stores that range', async () => {
    const api = installMockApi(
      vi.fn().mockResolvedValue({
        ...overview,
        range: { preset: '7d', startDate: '2026-04-24', endDate: '2026-04-30' },
      } satisfies AnalyticsOverview),
    )

    await useAnalyticsStore.getState().loadOverview('7d')

    expect(api.getOverview).toHaveBeenCalledWith('7d')
    expect(useAnalyticsStore.getState().rangePreset).toBe('7d')
    expect(useAnalyticsStore.getState().overview?.range.preset).toBe('7d')
  })

  it('can switch range without loading', () => {
    installMockApi()

    useAnalyticsStore.getState().setRangePreset('90d')

    expect(useAnalyticsStore.getState().rangePreset).toBe('90d')
    expect(useAnalyticsStore.getState().overview).toBeNull()
  })

  it('captures load errors', async () => {
    installMockApi(vi.fn().mockRejectedValue(new Error('analytics failed')))

    await useAnalyticsStore.getState().loadOverview('all')

    expect(useAnalyticsStore.getState()).toMatchObject({
      rangePreset: 'all',
      overview: null,
      isLoading: false,
      error: 'analytics failed',
    })
  })

  it('clears errors', () => {
    installMockApi()
    useAnalyticsStore.setState({ error: 'nope' })

    useAnalyticsStore.getState().clearError()

    expect(useAnalyticsStore.getState().error).toBeNull()
  })
})
