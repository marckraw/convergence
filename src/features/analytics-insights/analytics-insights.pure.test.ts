import { describe, expect, it } from 'vitest'
import type { AnalyticsOverview } from '@/entities/analytics'
import {
  buildConversationBalanceChartOptions,
  buildDailyActivityChartOptions,
  buildProviderUsageChartOptions,
  formatCompact,
  formatDateLabel,
  formatHour,
  formatInteger,
  formatSignedInteger,
  getHeatmapCount,
  getHeatmapLevel,
  getRangeLabel,
  hasUsageActivity,
} from './analytics-insights.pure'

const overview: AnalyticsOverview = {
  range: {
    preset: '30d',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
  },
  totals: {
    userMessages: 2,
    assistantMessages: 3,
    userWords: 100,
    assistantWords: 300,
    sessionsCreated: 1,
    turnsCompleted: 4,
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0,
    approvalRequests: 0,
    inputRequests: 0,
    attachmentsSent: 0,
    toolCalls: 0,
    failedSessions: 0,
  },
  streaks: {
    current: 1,
    longest: 2,
    activeDays: ['2026-04-30'],
  },
  dailyActivity: [
    {
      date: '2026-04-29',
      userMessages: 1,
      assistantMessages: 1,
      userWords: 40,
      assistantWords: 120,
      sessionsCreated: 1,
      turnsCompleted: 2,
      filesChanged: 0,
    },
    {
      date: '2026-04-30',
      userMessages: 1,
      assistantMessages: 2,
      userWords: 60,
      assistantWords: 180,
      sessionsCreated: 0,
      turnsCompleted: 2,
      filesChanged: 0,
    },
  ],
  providerUsage: [
    {
      providerId: 'codex',
      providerName: 'Codex',
      sessionsCreated: 1,
      turnsCompleted: 4,
      userMessages: 2,
      assistantMessages: 3,
    },
  ],
  projectUsage: [],
  weekdayHourActivity: [{ weekday: 4, hour: 13, count: 5 }],
  conversationBalance: [
    { date: '2026-04-29', userWords: 40, assistantWords: 120 },
    { date: '2026-04-30', userWords: 60, assistantWords: 180 },
  ],
  deterministicProfile: {
    mostUsedProvider: null,
    mostActiveProject: null,
    peakActivity: null,
    sessionSizeBucket: 'normal-task',
    interactionShape: 'mixed-exploration-implementation',
    summary: 'Local summary.',
  },
  generatedProfile: null,
}

describe('analytics insights view helpers', () => {
  it('formats numbers, ranges, dates, and hours for compact UI labels', () => {
    expect(formatInteger(12_345)).toBe('12,345')
    expect(formatCompact(12_345)).toBe('12.3K')
    expect(formatSignedInteger(12)).toBe('+12')
    expect(formatSignedInteger(-4)).toBe('-4')
    expect(getRangeLabel('7d')).toBe('7 days')
    expect(getRangeLabel('30d')).toBe('30 days')
    expect(getRangeLabel('90d')).toBe('90 days')
    expect(getRangeLabel('all')).toBe('All time')
    expect(formatDateLabel('2026-04-30')).toContain('30')
    expect(formatHour(0)).toBe('12a')
    expect(formatHour(12)).toBe('12p')
    expect(formatHour(23)).toBe('11p')
  })

  it('detects whether an overview has local usage activity', () => {
    expect(hasUsageActivity(overview)).toBe(true)
    expect(
      hasUsageActivity({
        ...overview,
        totals: {
          ...overview.totals,
          userMessages: 0,
          assistantMessages: 0,
          sessionsCreated: 0,
          turnsCompleted: 0,
        },
      }),
    ).toBe(false)
  })

  it('builds chart options from overview data', () => {
    const daily = buildDailyActivityChartOptions(overview.dailyActivity)
    const provider = buildProviderUsageChartOptions(overview)
    const balance = buildConversationBalanceChartOptions(overview)

    expect(daily.series).toHaveLength(2)
    expect(provider.series).toHaveLength(2)
    expect(balance.series).toHaveLength(2)
    expect(daily.xAxis?.max).toBe(1)
    expect(provider.legend?.show).toBe(true)
    expect(balance.tooltip?.trigger).toBe('axis')
  })

  it('maps weekday and hour buckets into heatmap levels', () => {
    expect(getHeatmapCount(overview.weekdayHourActivity, 4, 13)).toBe(5)
    expect(getHeatmapCount(overview.weekdayHourActivity, 4, 14)).toBe(0)
    expect(getHeatmapLevel(0, 5)).toBe(0)
    expect(getHeatmapLevel(1, 5)).toBe(2)
    expect(getHeatmapLevel(3, 5)).toBe(3)
    expect(getHeatmapLevel(5, 5)).toBe(4)
  })
})
