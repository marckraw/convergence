import type {
  ProviderQuotaProviderId,
  ProviderQuotaSnapshot,
  ProviderRateLimitSignal,
} from './provider-quota.types'

export function findProviderQuotaSnapshot(
  snapshots: ProviderQuotaSnapshot[],
  providerId: ProviderQuotaProviderId,
): ProviderQuotaSnapshot | null {
  return (
    snapshots.find((snapshot) => snapshot.providerId === providerId) ?? null
  )
}

export type ProviderRateLimitTone = 'ok' | 'warning' | 'danger' | 'neutral'

export interface ProviderRateLimitDisplay {
  headline: string
  /** Which window and when it resets, when the provider said. */
  detail: string | null
  tone: ProviderRateLimitTone
}

/**
 * Renders the provider's own limit reading (ADR 0007, PA8).
 *
 * The event carries a state, a window, and a reset time — no utilization
 * percentage — so this produces words and never a number. A status Convergence
 * does not recognise is shown verbatim in a neutral tone rather than being
 * bucketed into a colour it might not deserve.
 */
export function describeProviderRateLimit(
  signal: ProviderRateLimitSignal | null | undefined,
): ProviderRateLimitDisplay | null {
  if (!signal) return null

  const { headline, tone } = describeStatus(signal.status)
  const parts: string[] = []
  if (signal.rateLimitType) {
    // Humanised, not interpreted: the wire names are not a documented
    // vocabulary, so underscores become spaces and nothing is renamed.
    parts.push(`${signal.rateLimitType.replace(/_/g, ' ')} window`)
  }
  const resetsAt = formatResetTime(signal.resetsAt)
  if (resetsAt) parts.push(`resets ${resetsAt}`)

  return {
    headline,
    detail: parts.length > 0 ? capitalise(parts.join(', ')) : null,
    tone,
  }
}

function describeStatus(status: string): {
  headline: string
  tone: ProviderRateLimitTone
} {
  switch (status) {
    case 'allowed':
      return { headline: 'Within limits', tone: 'ok' }
    case 'allowed_warning':
      return { headline: 'Approaching the limit', tone: 'warning' }
    case 'rejected':
      return { headline: 'Limit reached', tone: 'danger' }
    default:
      return { headline: status, tone: 'neutral' }
  }
}

function formatResetTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
