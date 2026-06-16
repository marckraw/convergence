import type {
  ProviderQuotaAvailableSnapshot,
  ProviderQuotaSnapshot,
  ProviderQuotaWindow,
} from './provider-quota.types'
import { readRecord } from './codex-quota.pure'

const WEEK_MINUTES = 10_080
const FIVE_HOUR_MINUTES = 300

export function resolveCcusageNativePackageName(
  platform: NodeJS.Platform,
  arch: string,
): string | null {
  if (platform === 'darwin') {
    if (arch === 'arm64') return '@ccusage/ccusage-darwin-arm64'
    if (arch === 'x64') return '@ccusage/ccusage-darwin-x64'
  }
  if (platform === 'linux') {
    if (arch === 'arm64') return '@ccusage/ccusage-linux-arm64'
    if (arch === 'x64') return '@ccusage/ccusage-linux-x64'
  }
  if (platform === 'win32') {
    if (arch === 'arm64') return '@ccusage/ccusage-win32-arm64'
    if (arch === 'x64') return '@ccusage/ccusage-win32-x64'
  }
  return null
}

export function resolveCcusageNativeBinaryPath(platform: NodeJS.Platform) {
  return platform === 'win32' ? 'bin/ccusage.exe' : 'bin/ccusage'
}

export function resolveAsarUnpackedPath(path: string): string {
  return path.replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2')
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function elapsedPercent(start: Date, end: Date, now: Date): number {
  const totalMs = end.getTime() - start.getTime()
  if (totalMs <= 0) return 0
  return clampPercent(((now.getTime() - start.getTime()) / totalMs) * 100)
}

function parseWeekStart(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (Number.isNaN(date.getTime())) return null
  return date
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M tokens`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K tokens`
  return `${Math.round(value)} tokens`
}

function formatCost(value: number | null): string | null {
  if (value === null) return null
  return `$${value.toFixed(2)}`
}

function formatUsageValue(tokens: number, cost: number | null): string {
  const parts = [formatTokenCount(tokens)]
  const costLabel = formatCost(cost)
  if (costLabel) parts.push(costLabel)
  return parts.join(', ')
}

function latestCurrentWeeklyEntry(
  payload: unknown,
  now: Date,
): Record<string, unknown> | null {
  const root = readRecord(payload)
  const weekly = root?.weekly
  if (!Array.isArray(weekly)) return null

  const candidates = weekly.flatMap((entry) => {
    const record = readRecord(entry)
    const week = readString(record?.week)
    if (!record || !week) return []
    const startsAt = parseWeekStart(week)
    if (!startsAt) return []
    const endsAt = addMinutes(startsAt, WEEK_MINUTES)
    if (now < startsAt || now >= endsAt) return []
    return [{ record, startsAt, endsAt }]
  })

  return (
    candidates.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0]
      ?.record ?? null
  )
}

function mapWeeklyWindow(
  payload: unknown,
  now: Date,
): ProviderQuotaWindow | null {
  const record = latestCurrentWeeklyEntry(payload, now)
  if (!record) return null

  const week = readString(record.week)
  if (!week) return null
  const startsAt = parseWeekStart(week)
  if (!startsAt) return null
  const endsAt = addMinutes(startsAt, WEEK_MINUTES)
  const usedPercent = elapsedPercent(startsAt, endsAt, now)
  const totalTokens = readNumber(record.totalTokens) ?? 0

  return {
    kind: 'weekly',
    label: "This week's Claude usage",
    usedPercent,
    remainingPercent: 100 - usedPercent,
    windowMinutes: WEEK_MINUTES,
    resetsAt: endsAt.toISOString(),
    displayMode: 'observed-usage',
    valueLabel: formatUsageValue(totalTokens, readNumber(record.totalCost)),
    resetLabel: 'Ends',
  }
}

function latestActiveBlock(payload: unknown): Record<string, unknown> | null {
  const root = readRecord(payload)
  const blocks = root?.blocks
  if (!Array.isArray(blocks)) return null

  return (
    blocks
      .flatMap((entry) => {
        const record = readRecord(entry)
        return record?.isActive === true && record.isGap !== true
          ? [record]
          : []
      })
      .sort((a, b) => {
        const aStart = Date.parse(readString(a.startTime) ?? '')
        const bStart = Date.parse(readString(b.startTime) ?? '')
        return (
          (Number.isFinite(bStart) ? bStart : 0) -
          (Number.isFinite(aStart) ? aStart : 0)
        )
      })[0] ?? null
  )
}

function mapActiveBlockWindow(
  payload: unknown,
  now: Date,
): ProviderQuotaWindow | null {
  const record = latestActiveBlock(payload)
  if (!record) return null

  const startTime = readString(record.startTime)
  const endTime = readString(record.endTime)
  if (!startTime || !endTime) return null

  const startsAt = new Date(startTime)
  const endsAt = new Date(endTime)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return null
  }

  const usedPercent = elapsedPercent(startsAt, endsAt, now)
  const totalTokens = readNumber(record.totalTokens) ?? 0

  return {
    kind: 'five-hour',
    label: 'Current 5-hour Claude usage',
    usedPercent,
    remainingPercent: 100 - usedPercent,
    windowMinutes: FIVE_HOUR_MINUTES,
    resetsAt: endsAt.toISOString(),
    displayMode: 'observed-usage',
    valueLabel: formatUsageValue(totalTokens, readNumber(record.costUSD)),
    resetLabel: 'Ends',
  }
}

export function buildClaudeQuotaUnavailableSnapshot(
  reason: string,
  nowIso: string,
): ProviderQuotaSnapshot {
  return {
    providerId: 'claude-code',
    status: 'unavailable',
    source: 'local-usage-log',
    reason,
    usageUrl: 'https://claude.ai/new#settings/usage',
    lastCheckedAt: nowIso,
    stale: false,
  }
}

export function mapClaudeUsagePayloadsToQuotaSnapshot(
  weeklyPayload: unknown,
  blocksPayload: unknown,
  nowIso: string,
): ProviderQuotaAvailableSnapshot {
  const now = new Date(nowIso)
  if (Number.isNaN(now.getTime())) {
    throw new Error('Claude usage mapping requires a valid timestamp.')
  }

  const windows = [
    mapActiveBlockWindow(blocksPayload, now),
    mapWeeklyWindow(weeklyPayload, now),
  ].filter((window): window is ProviderQuotaWindow => window !== null)

  return {
    providerId: 'claude-code',
    status: 'available',
    source: 'local-usage-log',
    planType: null,
    windows,
    credits: null,
    limitReachedType: null,
    lastCheckedAt: nowIso,
    stale: false,
  }
}
