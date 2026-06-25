import type {
  ProviderQuotaProviderId,
  ProviderQuotaSnapshot,
  ProviderQuotaUnavailableSnapshot,
} from './provider-quota.types'

export interface ProviderQuotaRequestOptions {
  forceRefresh?: boolean
}

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
