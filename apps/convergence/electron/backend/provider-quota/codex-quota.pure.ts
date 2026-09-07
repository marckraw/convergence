import type {
  ProviderCreditsQuota,
  ProviderQuotaSnapshot,
  ProviderQuotaAvailableSnapshot,
  ProviderQuotaWindow,
  ProviderQuotaWindowKind,
} from './provider-quota.types'

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

/**
 * The honest answer while the resident app-server is still coming up.
 *
 * The cold start is 7-25s and paid once per app launch (constitution CX2-1).
 * Before this, the quota read simply blocked on it and the pill went on showing
 * whatever it last knew -- a number with nothing behind it (MAR-2825).
 */
export function buildCodexQuotaWarmingUp(
  nowIso: string,
): ProviderQuotaSnapshot {
  return {
    providerId: 'codex',
    status: 'unavailable',
    source: 'provider-api',
    reason: 'Codex is starting up.',
    lastCheckedAt: nowIso,
    stale: false,
    warmingUp: true,
  }
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
