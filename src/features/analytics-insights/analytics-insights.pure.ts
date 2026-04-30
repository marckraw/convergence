import type { ChartGPUOptions } from 'chartgpu-react'
import type {
  AnalyticsOverview,
  AnalyticsRangePreset,
  DailyActivityPoint,
  WeekdayHourActivityPoint,
} from '@/entities/analytics'

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

const INTEGER_FORMATTER = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

const COMPACT_FORMATTER = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CHART_PALETTE = ['#2563eb', '#14b8a6', '#f59e0b', '#7c3aed', '#ef4444']

export function formatInteger(value: number): string {
  return INTEGER_FORMATTER.format(value)
}

export function formatCompact(value: number): string {
  return Math.abs(value) >= 10_000
    ? COMPACT_FORMATTER.format(value)
    : INTEGER_FORMATTER.format(value)
}

export function formatSignedInteger(value: number): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : ''}${INTEGER_FORMATTER.format(value)}`
}

export function getRangeLabel(preset: AnalyticsRangePreset): string {
  switch (preset) {
    case '7d':
      return '7 days'
    case '30d':
      return '30 days'
    case '90d':
      return '90 days'
    case 'all':
      return 'All time'
  }
}

export function hasUsageActivity(overview: AnalyticsOverview | null): boolean {
  if (!overview) return false
  const { totals } = overview
  return (
    totals.userMessages +
      totals.assistantMessages +
      totals.sessionsCreated +
      totals.turnsCompleted >
    0
  )
}

export function formatDateLabel(date: string): string {
  return DATE_FORMATTER.format(new Date(`${date}T00:00:00`))
}

export function formatHour(hour: number): string {
  if (hour === 0) return '12a'
  if (hour < 12) return `${hour}a`
  if (hour === 12) return '12p'
  return `${hour - 12}p`
}

export function buildDailyActivityChartOptions(
  points: DailyActivityPoint[],
): ChartGPUOptions {
  return {
    palette: CHART_PALETTE,
    grid: { left: 40, right: 16, top: 12, bottom: 28 },
    gridLines: {
      color: 'rgba(148, 163, 184, 0.22)',
      horizontal: { count: 4 },
      vertical: false,
    },
    xAxis: { type: 'value', min: 0, max: Math.max(points.length - 1, 1) },
    yAxis: { type: 'value', min: 0 },
    legend: { show: true, position: 'bottom' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'area',
        name: 'User messages',
        color: '#2563eb',
        areaStyle: { opacity: 0.18, color: '#2563eb' },
        data: points.map((point, index) => ({
          x: index,
          y: point.userMessages,
        })),
      },
      {
        type: 'line',
        name: 'Turns',
        color: '#14b8a6',
        lineStyle: { width: 2, color: '#14b8a6' },
        data: points.map((point, index) => ({
          x: index,
          y: point.turnsCompleted,
        })),
      },
    ],
  }
}

export function buildProviderUsageChartOptions(
  overview: AnalyticsOverview,
): ChartGPUOptions {
  const points = overview.providerUsage.slice(0, 8)

  return {
    palette: CHART_PALETTE,
    grid: { left: 40, right: 16, top: 12, bottom: 28 },
    gridLines: {
      color: 'rgba(148, 163, 184, 0.22)',
      horizontal: { count: 4 },
      vertical: false,
    },
    xAxis: { type: 'value', min: 0, max: Math.max(points.length - 1, 1) },
    yAxis: { type: 'value', min: 0 },
    legend: { show: true, position: 'bottom' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'bar',
        name: 'Sessions',
        color: '#7c3aed',
        barWidth: '34%',
        data: points.map((point, index) => ({
          x: index,
          y: point.sessionsCreated,
        })),
      },
      {
        type: 'bar',
        name: 'Turns',
        color: '#f59e0b',
        barWidth: '34%',
        data: points.map((point, index) => ({
          x: index,
          y: point.turnsCompleted,
        })),
      },
    ],
  }
}

export function buildConversationBalanceChartOptions(
  overview: AnalyticsOverview,
): ChartGPUOptions {
  const points = overview.conversationBalance

  return {
    palette: CHART_PALETTE,
    grid: { left: 44, right: 16, top: 12, bottom: 28 },
    gridLines: {
      color: 'rgba(148, 163, 184, 0.22)',
      horizontal: { count: 4 },
      vertical: false,
    },
    xAxis: { type: 'value', min: 0, max: Math.max(points.length - 1, 1) },
    yAxis: { type: 'value', min: 0 },
    legend: { show: true, position: 'bottom' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'line',
        name: 'User words',
        color: '#2563eb',
        lineStyle: { width: 2, color: '#2563eb' },
        data: points.map((point, index) => ({ x: index, y: point.userWords })),
      },
      {
        type: 'area',
        name: 'Assistant words',
        color: '#14b8a6',
        areaStyle: { opacity: 0.16, color: '#14b8a6' },
        data: points.map((point, index) => ({
          x: index,
          y: point.assistantWords,
        })),
      },
    ],
  }
}

export function getHeatmapCount(
  points: WeekdayHourActivityPoint[],
  weekday: number,
  hour: number,
): number {
  return (
    points.find((point) => point.weekday === weekday && point.hour === hour)
      ?.count ?? 0
  )
}

export function getHeatmapLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  const ratio = count / max
  if (ratio >= 0.75) return 4
  if (ratio >= 0.45) return 3
  if (ratio >= 0.2) return 2
  return 1
}
