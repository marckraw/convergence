import {
  isRateLimitSignalExpired,
  providerQuotaAccountKey,
  type ClaudeRateLimitObservation,
  type ProviderQuotaAccountScope,
} from './claude-rate-limit.pure'
import type { ProviderRateLimitSignal } from './provider-quota.types'

/**
 * The account-keyed cache of what Claude last told us about its own limits
 * (ADR 0007, PA8).
 *
 * Keyed by `(executionHostId, providerAccountId)` because that pair is what
 * makes a limit belong to somebody: two accounts on one machine have separate
 * limits, and the same account id means nothing on a different host. Reading
 * one account's numbers under another's name is the failure this key exists to
 * prevent.
 *
 * In memory only. The signal describes a window measured in hours, it arrives
 * again on the next turn, and persisting it would mean showing a limit from
 * last week as if it were current.
 */
export class ClaudeRateLimitState {
  private readonly signals = new Map<string, ProviderRateLimitSignal>()

  constructor(private readonly now: () => Date = () => new Date()) {}

  record(
    scope: ProviderQuotaAccountScope,
    observation: ClaudeRateLimitObservation,
  ): void {
    this.signals.set(providerQuotaAccountKey(scope), {
      providerAccountId: scope.providerAccountId,
      status: observation.status,
      rateLimitType: observation.rateLimitType,
      resetsAt: observation.resetsAt,
      observedAt: this.now().toISOString(),
    })
  }

  /**
   * Drops a signal whose window has already reset: it describes a limit that no
   * longer applies, and staying silent is more honest than repeating it.
   */
  get(scope: ProviderQuotaAccountScope): ProviderRateLimitSignal | null {
    const key = providerQuotaAccountKey(scope)
    const signal = this.signals.get(key)
    if (!signal) return null

    if (isRateLimitSignalExpired(signal, this.now())) {
      this.signals.delete(key)
      return null
    }

    return signal
  }
}
