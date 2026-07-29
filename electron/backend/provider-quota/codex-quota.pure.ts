import type {
  ProviderCreditsQuota,
  ProviderQuotaSnapshot,
  ProviderQuotaAvailableSnapshot,
  ProviderQuotaWindow,
  ProviderQuotaWindowKind,
} from './provider-quota.types'

interface CodexUsageWindowRecord {
  used_percent?: unknown
  limit_window_seconds?: unknown
  reset_at?: unknown
}

interface CodexUsageRateLimitRecord {
  primary_window?: unknown
  secondary_window?: unknown
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function buildCodexQuotaAuthError(
  reason: string,
  nowIso: string,
): ProviderQuotaSnapshot {
  return {
    providerId: 'codex',
    status: 'unavailable',
    source: 'provider-api',
    reason,
    lastCheckedAt: nowIso,
    stale: false,
  }
}

function unwrapOptionalBox(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 1) return value[0]
  return value
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function classifyWindow(
  windowMinutes: number | null,
  fallback: ProviderQuotaWindowKind,
): ProviderQuotaWindowKind {
  if (windowMinutes !== null) {
    if (windowMinutes >= 290 && windowMinutes <= 310) return 'five-hour'
    if (windowMinutes >= 9_900 && windowMinutes <= 10_200) return 'weekly'
  }
  return fallback
}

function formatWindowLabel(kind: ProviderQuotaWindowKind): string {
  switch (kind) {
    case 'five-hour':
      return '5 hour usage limit'
    case 'weekly':
      return 'Weekly usage limit'
    case 'other':
      return 'Usage limit'
  }
}

function mapWindow(
  value: unknown,
  fallbackKind: ProviderQuotaWindowKind,
): ProviderQuotaWindow | null {
  const record = readRecord(
    unwrapOptionalBox(value),
  ) as CodexUsageWindowRecord | null
  if (!record) return null

  const usedPercent = readNumber(record.used_percent)
  if (usedPercent === null) return null

  const windowSeconds = readNumber(record.limit_window_seconds)
  const windowMinutes =
    windowSeconds === null || windowSeconds <= 0
      ? null
      : Math.ceil(windowSeconds / 60)
  const kind = classifyWindow(windowMinutes, fallbackKind)
  const resetAt = readNumber(record.reset_at)

  return {
    kind,
    label: formatWindowLabel(kind),
    usedPercent: clampPercent(usedPercent),
    remainingPercent: clampPercent(100 - usedPercent),
    windowMinutes,
    resetsAt: resetAt === null ? null : new Date(resetAt * 1000).toISOString(),
  }
}

function mapRateLimitWindows(value: unknown): ProviderQuotaWindow[] {
  const rateLimit = readRecord(
    unwrapOptionalBox(value),
  ) as CodexUsageRateLimitRecord | null
  if (!rateLimit) return []

  return [
    mapWindow(rateLimit.primary_window, 'five-hour'),
    mapWindow(rateLimit.secondary_window, 'weekly'),
  ].filter((window): window is ProviderQuotaWindow => window !== null)
}

function mapCredits(value: unknown): ProviderCreditsQuota | null {
  const record = readRecord(unwrapOptionalBox(value))
  if (!record) return null

  return {
    hasCredits: record.has_credits === true,
    unlimited: record.unlimited === true,
    balance:
      typeof record.balance === 'string'
        ? record.balance
        : record.balance === null
          ? null
          : String(record.balance ?? ''),
  }
}

function readAdditionalWindows(payload: Record<string, unknown>) {
  const additional = payload.additional_rate_limits
  if (!Array.isArray(additional)) return []

  return additional.flatMap((entry) => {
    const record = readRecord(entry)
    if (!record) return []
    return mapRateLimitWindows(record.rate_limit).map((window) => ({
      ...window,
      kind: 'other' as const,
      label:
        typeof record.limit_name === 'string'
          ? record.limit_name
          : window.label,
    }))
  })
}

/**
 * Maps the `account/rateLimits/read` app-server response. Codex reports the
 * same limits here as the chatgpt.com usage endpoint but in camelCase and with
 * a `rateLimitsByLimitId` map for the per-model buckets, so it needs its own
 * mapper rather than a rename of the scrape's.
 */
function mapRpcWindow(
  value: unknown,
  fallbackKind: ProviderQuotaWindowKind,
  labelOverride?: string | null,
): ProviderQuotaWindow | null {
  const record = readRecord(value)
  if (!record) return null

  const usedPercent = readNumber(record.usedPercent)
  if (usedPercent === null) return null

  const windowMinutes = readNumber(record.windowDurationMins)
  const kind = classifyWindow(windowMinutes, fallbackKind)
  const resetsAt = readNumber(record.resetsAt)

  return {
    kind: labelOverride ? 'other' : kind,
    label: labelOverride ?? formatWindowLabel(kind),
    usedPercent: clampPercent(usedPercent),
    remainingPercent: clampPercent(100 - usedPercent),
    windowMinutes:
      windowMinutes !== null && windowMinutes > 0 ? windowMinutes : null,
    resetsAt:
      resetsAt === null ? null : new Date(resetsAt * 1000).toISOString(),
  }
}

function mapRpcCredits(value: unknown): ProviderCreditsQuota | null {
  const record = readRecord(value)
  if (!record) return null

  return {
    hasCredits: record.hasCredits === true,
    unlimited: record.unlimited === true,
    balance:
      typeof record.balance === 'string'
        ? record.balance
        : record.balance === null || record.balance === undefined
          ? null
          : String(record.balance),
  }
}

export function mapCodexRateLimitsToQuotaSnapshot(
  payload: unknown,
  nowIso: string,
): ProviderQuotaAvailableSnapshot {
  const root = readRecord(payload)
  const rateLimits = readRecord(root?.rateLimits)
  if (!rateLimits) {
    throw new Error('Codex rate limits response carried no rateLimits.')
  }

  const windows = [
    mapRpcWindow(rateLimits.primary, 'five-hour'),
    mapRpcWindow(rateLimits.secondary, 'weekly'),
  ].filter((window): window is ProviderQuotaWindow => window !== null)

  // Named buckets (per-model limits) arrive alongside the main one; skip the
  // entry that is the main limit so it is not counted twice.
  const mainLimitId =
    typeof rateLimits.limitId === 'string' ? rateLimits.limitId : null
  const byLimitId = readRecord(root?.rateLimitsByLimitId)
  const namedWindows = byLimitId
    ? Object.entries(byLimitId).flatMap(([limitId, entry]) => {
        if (limitId === mainLimitId) return []
        const record = readRecord(entry)
        if (!record) return []
        const label =
          typeof record.limitName === 'string' && record.limitName
            ? record.limitName
            : limitId
        return [
          mapRpcWindow(record.primary, 'other', label),
          mapRpcWindow(record.secondary, 'other', label),
        ].filter((window): window is ProviderQuotaWindow => window !== null)
      })
    : []

  return {
    providerId: 'codex',
    status: 'available',
    source: 'provider-api',
    planType:
      typeof rateLimits.planType === 'string' ? rateLimits.planType : null,
    windows: [...windows, ...namedWindows],
    credits: mapRpcCredits(rateLimits.credits),
    limitReachedType:
      typeof rateLimits.rateLimitReachedType === 'string'
        ? rateLimits.rateLimitReachedType
        : null,
    lastCheckedAt: nowIso,
    stale: false,
  }
}

export function mapCodexUsagePayloadToQuotaSnapshot(
  payload: unknown,
  nowIso: string,
): ProviderQuotaAvailableSnapshot {
  const record = readRecord(payload)
  if (!record) {
    throw new Error('Codex usage payload was not an object.')
  }

  const windows = [
    ...mapRateLimitWindows(record.rate_limit),
    ...readAdditionalWindows(record),
  ]

  return {
    providerId: 'codex',
    status: 'available',
    source: 'provider-api',
    planType: typeof record.plan_type === 'string' ? record.plan_type : null,
    windows,
    credits: mapCredits(record.credits),
    limitReachedType:
      readRecord(
        unwrapOptionalBox(record.rate_limit_reached_type),
      )?.kind?.toString() ?? null,
    lastCheckedAt: nowIso,
    stale: false,
  }
}
