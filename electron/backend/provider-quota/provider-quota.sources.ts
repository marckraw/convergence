import type { ClaudeQuotaService } from './claude-quota.service'
import type { CodexQuotaService } from './codex-quota.service'
import type {
  ProviderQuotaProviderId,
  ProviderQuotaSnapshot,
  ProviderQuotaUnavailableSnapshot,
} from './provider-quota.types'
import type {
  ProviderQuotaRequestOptions,
  ProviderQuotaSnapshotSource,
} from './provider-quota.service'

interface ServiceBackedQuotaSourceInput {
  providerId: ProviderQuotaProviderId
  fallbackSource: ProviderQuotaUnavailableSnapshot['source']
  usageUrl?: string
  service: {
    getQuota(
      options?: ProviderQuotaRequestOptions,
    ): Promise<ProviderQuotaSnapshot>
  }
}

interface ManualQuotaSourceInput {
  providerId: ProviderQuotaProviderId
  reason: string
  usageUrl: string
}

interface ManualQuotaSourceDeps {
  now?: () => Date
}

export interface DefaultProviderQuotaSourcesInput {
  codex: Pick<CodexQuotaService, 'getQuota'>
  claude: Pick<ClaudeQuotaService, 'getQuota'>
  now?: () => Date
}

const CLAUDE_USAGE_URL = 'https://claude.ai/new#settings/usage'
const CURSOR_USAGE_URL = 'https://cursor.com/dashboard'
const ANTIGRAVITY_USAGE_URL = 'https://www.antigravity.google/docs/plans'

const CURSOR_MANUAL_REASON =
  'Cursor ACP does not expose usage or quota counters to Convergence. Open the Cursor dashboard to inspect usage and billing.'

const ANTIGRAVITY_MANUAL_REASON =
  'Antigravity CLI exposes quota through its interactive /usage and /quota panels, but does not expose a machine-readable quota endpoint to Convergence yet. Run `agy` and use /usage or /quota for live limits.'

export function createServiceBackedQuotaSource({
  providerId,
  fallbackSource,
  usageUrl,
  service,
}: ServiceBackedQuotaSourceInput): ProviderQuotaSnapshotSource {
  return {
    providerId,
    fallbackSource,
    usageUrl,
    getQuota: (options) => service.getQuota(options),
  }
}

export function createManualQuotaSource(
  input: ManualQuotaSourceInput,
  deps: ManualQuotaSourceDeps = {},
): ProviderQuotaSnapshotSource {
  const now = deps.now ?? (() => new Date())

  return {
    providerId: input.providerId,
    fallbackSource: 'manual',
    usageUrl: input.usageUrl,
    async getQuota() {
      return {
        providerId: input.providerId,
        status: 'unavailable',
        source: 'manual',
        reason: input.reason,
        usageUrl: input.usageUrl,
        lastCheckedAt: now().toISOString(),
        stale: false,
      }
    },
  }
}

/**
 * Factory and composition root for the default quota strategies.
 *
 * Keeps provider registration order and manual quota fallbacks in one place so
 * ProviderQuotaService can stay focused on orchestration.
 */
export function createDefaultProviderQuotaSources({
  codex,
  claude,
  now,
}: DefaultProviderQuotaSourcesInput): ProviderQuotaSnapshotSource[] {
  return [
    createServiceBackedQuotaSource({
      providerId: 'codex',
      fallbackSource: 'provider-api',
      service: codex,
    }),
    createServiceBackedQuotaSource({
      providerId: 'claude-code',
      fallbackSource: 'local-usage-log',
      usageUrl: CLAUDE_USAGE_URL,
      service: claude,
    }),
    createManualQuotaSource(
      {
        providerId: 'cursor',
        reason: CURSOR_MANUAL_REASON,
        usageUrl: CURSOR_USAGE_URL,
      },
      { now },
    ),
    createManualQuotaSource(
      {
        providerId: 'antigravity',
        reason: ANTIGRAVITY_MANUAL_REASON,
        usageUrl: ANTIGRAVITY_USAGE_URL,
      },
      { now },
    ),
  ]
}
