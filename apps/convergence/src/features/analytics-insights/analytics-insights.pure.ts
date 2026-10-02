import type {
  ChartGPUOptions,
  TooltipConfig,
  TooltipParams,
} from 'chartgpu-react'
import type {
  AnalyticsOverview,
  AnalyticsRangePreset,
  ConversationBalancePoint,
  DailyActivityPoint,
  WeekdayHourActivityPoint,
} from '@/entities/analytics'
import { chartTokens } from '@convergence/ui'

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
export const WEEKDAY_LABELS_MONDAY_FIRST = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
]
export const WEEKDAY_FULL_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
export const WEEKDAY_FULL_NAMES_MONDAY_FIRST = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

/**
 * ChartGPU draws on the GPU and can't read CSS, so the series come from the
 * chart tokens' mirror (R1): the first two are what the legends call series
 * 1 and 2.
 */
const CHART_PALETTE = [...chartTokens.series]
const [SERIES_1, SERIES_2] = chartTokens.series

function normalizeTooltipParams(
  params: TooltipParams | ReadonlyArray<TooltipParams>,
): ReadonlyArray<TooltipParams> {
  return Array.isArray(params)
    ? (params as ReadonlyArray<TooltipParams>)
    : [params as TooltipParams]
}

function formatTooltip(
  title: string,
  params: TooltipParams | ReadonlyArray<TooltipParams>,
): string {
  const lines = normalizeTooltipParams(params).map((item) => {
    const value = item.value[1]
    return `${item.seriesName}: ${formatInteger(value)}`
  })

  return [title, ...lines].join('<br/>')
}

function createTooltipFormatter(
  resolveTitle: (params: ReadonlyArray<TooltipParams>) => string,
): NonNullable<TooltipConfig['formatter']> {
  return ((params: TooltipParams | ReadonlyArray<TooltipParams>) => {
    const items = normalizeTooltipParams(params)
    return formatTooltip(resolveTitle(items), items)
  }) as NonNullable<TooltipConfig['formatter']>
}

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

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function dateKeyToTimestamp(date: string): number {
  return new Date(`${date}T00:00:00`).getTime()
}

function timestampToDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildTimeAxisBounds(points: ReadonlyArray<{ date: string }>): {
  min: number
  max: number
} {
  if (points.length === 0) {
    const now = Date.now()
    return { min: now, max: now + ONE_DAY_MS }
  }
  const first = dateKeyToTimestamp(points[0].date)
  const last = dateKeyToTimestamp(points[points.length - 1].date)
  if (last <= first) return { min: first, max: first + ONE_DAY_MS }
  return { min: first, max: last }
}

function resolveDateLabelForTimestamp(
  points: ReadonlyArray<{ date: string }>,
  timestamp: number,
): string | null {
  if (!Number.isFinite(timestamp)) return null
  const exact = points.find(
    (point) => dateKeyToTimestamp(point.date) === timestamp,
  )
  if (exact) return exact.date
  return timestampToDateKey(timestamp)
}

/**
 * What the two charts over days share: the palette and grid lines, a time
 * axis over the points, a value axis from zero, and an axis tooltip titled
 * by its day (or the chart's name when it has none).
 */
function buildDayChartBase(
  points: ReadonlyArray<{ date: string }>,
  chartName: string,
  gridLeft: number,
): Omit<ChartGPUOptions, 'series'> {
  const { min, max } = buildTimeAxisBounds(points)

  return {
    palette: CHART_PALETTE,
    grid: { left: gridLeft, right: 16, top: 12, bottom: 28 },
    gridLines: {
      color: chartTokens.grid,
      horizontal: { count: 4 },
      vertical: false,
    },
    xAxis: { type: 'time', min, max },
    yAxis: { type: 'value', min: 0 },
    legend: { show: false },
    tooltip: {
      show: true,
      trigger: 'axis',
      formatter: createTooltipFormatter((params) => {
        const [first] = params
        if (!first) return chartName
        const date = resolveDateLabelForTimestamp(points, first.value[0])
        return date ? formatDateLabel(date) : chartName
      }),
    },
  }
}

export function buildDailyActivityChartOptions(
  points: DailyActivityPoint[],
): ChartGPUOptions {
  return {
    ...buildDayChartBase(points, 'Daily activity', 40),
    series: [
      {
        type: 'area',
        name: 'User messages',
        color: SERIES_1,
        areaStyle: { opacity: 0.18, color: SERIES_1 },
        data: points.map((point) => ({
          x: dateKeyToTimestamp(point.date),
          y: point.userMessages,
        })),
      },
      {
        type: 'line',
        name: 'Turns',
        color: SERIES_2,
        lineStyle: { width: 2, color: SERIES_2 },
        data: points.map((point) => ({
          x: dateKeyToTimestamp(point.date),
          y: point.turnsCompleted,
        })),
      },
    ],
  }
}

export function buildConversationBalanceChartOptions(
  overview: AnalyticsOverview,
): ChartGPUOptions {
  const points: ConversationBalancePoint[] = overview.conversationBalance

  return {
    ...buildDayChartBase(points, 'Conversation balance', 44),
    series: [
      {
        type: 'line',
        name: 'User words',
        color: SERIES_1,
        lineStyle: { width: 2, color: SERIES_1 },
        data: points.map((point) => ({
          x: dateKeyToTimestamp(point.date),
          y: point.userWords,
        })),
      },
      {
        type: 'area',
        name: 'Assistant words',
        color: SERIES_2,
        areaStyle: { opacity: 0.16, color: SERIES_2 },
        data: points.map((point) => ({
          x: dateKeyToTimestamp(point.date),
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
