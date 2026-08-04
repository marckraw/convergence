import type { ProviderRateLimitSignal } from './provider-quota.types'

/**
 * Claude's own rate-limit signal (ADR 0007, PA8).
 *
 * Claude Code emits a `rate_limit_event` on the stream and Convergence used to
 * drop it on the floor, which is why the app could sit at a limit all week
 * without being able to say so. The event is the only *account-authoritative*
 * usage information in the system: everything else Convergence shows about
 * Claude comes from ccusage reading the shared transcript store, which every
 * account writes to and which therefore cannot be split per account.
 *
 * What the event carries is a state, a window kind, and a reset time. It
 * carries no utilization percentage, so none is displayed — an invented
 * percentage would be indistinguishable from a measured one.
 */

export const PROVIDER_QUOTA_LOCAL_EXECUTION_HOST_ID = 'local'

/** The shared `~/.claude` credential, which has no account row. */
export const PROVIDER_QUOTA_AMBIENT_ACCOUNT_KEY = 'ambient-default'

export interface ProviderQuotaAccountScope {
  /** Accounts are host-scoped since PA1; remote hosts fail closed (PA10). */
  executionHostId: string
  providerAccountId: string | null
}

/**
 * The cache key for anything account-authoritative. Both halves matter: the
 * same account id means nothing on a different host, and two accounts on one
 * host must never read each other's numbers.
 */
export function providerQuotaAccountKey(
  scope: ProviderQuotaAccountScope,
): string {
  const account = scope.providerAccountId ?? PROVIDER_QUOTA_AMBIENT_ACCOUNT_KEY
  return `${scope.executionHostId}::${account}`
}

export interface ClaudeRateLimitObservation {
  /** Verbatim from the provider — never mapped to a percentage. */
  status: string
  rateLimitType: string | null
  resetsAt: string | null
}

/**
 * Reads what a `rate_limit_event` actually says, tolerating both casings and
 * both reset encodings. Returns null when there is no status to report:
 * degrade, never crash a session, and never display a shape we did not read.
 */
export function parseClaudeRateLimitEvent(
  event: unknown,
): ClaudeRateLimitObservation | null {
  if (typeof event !== 'object' || event === null) return null
  const record = event as Record<string, unknown>

  // Some releases nest the payload; both shapes are read rather than guessed at.
  const payload =
    typeof record.rate_limit_event === 'object' &&
    record.rate_limit_event !== null
      ? (record.rate_limit_event as Record<string, unknown>)
      : typeof record.rateLimitEvent === 'object' &&
          record.rateLimitEvent !== null
        ? (record.rateLimitEvent as Record<string, unknown>)
        : record

  const status = readString(payload.status)
  if (!status) return null

  return {
    status,
    rateLimitType:
      readString(payload.rateLimitType) ?? readString(payload.rate_limit_type),
    resetsAt:
      readResetTime(payload.resetsAt) ??
      readResetTime(payload.resets_at) ??
      readResetTime(payload.resetAt) ??
      readResetTime(payload.reset_at),
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Reset times arrive as an ISO string or as an epoch number whose unit is not
 * declared. Anything below 10^11 is treated as seconds — that boundary sits in
 * the year 5138 for seconds and 1973 for milliseconds, so no real reset time is
 * ambiguous.
 */
function readResetTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value < 1e11 ? value * 1000 : value
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const text = readString(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * A signal whose window has already reset describes a limit that no longer
 * exists, and no newer observation has arrived to replace it. Reporting it
 * would be worse than reporting nothing.
 */
export function isRateLimitSignalExpired(
  signal: Pick<ProviderRateLimitSignal, 'resetsAt'>,
  now: Date,
): boolean {
  if (!signal.resetsAt) return false
  const resetsAt = new Date(signal.resetsAt).getTime()
  if (Number.isNaN(resetsAt)) return false
  return resetsAt <= now.getTime()
}
