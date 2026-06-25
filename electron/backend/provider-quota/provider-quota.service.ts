import type {
  ProviderQuotaProviderId,
  ProviderQuotaSnapshot,
  ProviderQuotaUnavailableSnapshot,
} from './provider-quota.types'

export interface ProviderQuotaRequestOptions {
  forceRefresh?: boolean
}

/**
 * Strategy boundary for provider-specific quota retrieval.
 *
 * Each provider exposes the same snapshot contract so callers do not need
 * provider-specific branches for Codex, Claude Code, or manual fallbacks.
 */
export interface ProviderQuotaSnapshotSource {
  readonly providerId: ProviderQuotaProviderId
  readonly fallbackSource: ProviderQuotaUnavailableSnapshot['source']
  readonly usageUrl?: string
  getQuota(
    options?: ProviderQuotaRequestOptions,
  ): Promise<ProviderQuotaSnapshot>
}

interface ProviderQuotaServiceDeps {
  now?: () => Date
}

function errorReason(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Provider usage limits are unavailable.'
}

/**
 * Facade for provider quota reads.
 *
 * Callers ask for one quota snapshot list while individual providers remain
 * isolated behind ProviderQuotaSnapshotSource strategies.
 */
export class ProviderQuotaService {
  private readonly now: () => Date

  constructor(
    private readonly sources: readonly ProviderQuotaSnapshotSource[],
    deps: ProviderQuotaServiceDeps = {},
  ) {
    this.now = deps.now ?? (() => new Date())
  }

  async list(
    options: ProviderQuotaRequestOptions = {},
  ): Promise<ProviderQuotaSnapshot[]> {
    return Promise.all(
      this.sources.map((source) => this.readSource(source, options)),
    )
  }

  private async readSource(
    source: ProviderQuotaSnapshotSource,
    options: ProviderQuotaRequestOptions,
  ): Promise<ProviderQuotaSnapshot> {
    try {
      return await source.getQuota(options)
    } catch (error) {
      return {
        providerId: source.providerId,
        status: 'unavailable',
        source: source.fallbackSource,
        reason: errorReason(error),
        usageUrl: source.usageUrl,
        lastCheckedAt: this.now().toISOString(),
        stale: false,
      }
    }
  }
}
