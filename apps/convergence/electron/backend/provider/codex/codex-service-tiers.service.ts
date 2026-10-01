import type { CodexAccountEnvTarget } from '../../provider-account/provider-account-codex-env.pure'
import type { CodexServerHostRegistry } from './codex-server-host'
import {
  mapCodexServiceTiers,
  type CodexServiceTiersSnapshot,
} from './codex-service-tiers.pure'

/** How long one account's answer is reused. Plans change rarely; a pick reads it. */
export const CODEX_SERVICE_TIERS_CACHE_TTL_MS = 5 * 60_000

/** Reads `model/list` on one scope's resident server. */
export type CodexModelListReader = (
  account: CodexAccountEnvTarget | null,
) => Promise<unknown>

export interface CodexServiceTiersRequestScope {
  executionHostId: string
  providerAccountId: string | null
}

export interface CodexServiceTiersServiceOptions {
  readModelList?: CodexModelListReader
  /** Resolves the scope's account id to its `CODEX_HOME`. */
  resolveAccount?: (
    accountId: string | null | undefined,
  ) => CodexAccountEnvTarget | null
  isWarmingUp?: (account: CodexAccountEnvTarget | null) => boolean
  now?: () => number
}

/**
 * Which speeds Codex offers each account (MAR-3574).
 *
 * Built like `CodexQuotaService`, and for the same reason: the answer belongs
 * to an account. The descriptor's `model/list` is deliberately ambient, but
 * tiers are not — Codex offers Ultrafast to Pro $500 accounts only, and a tier
 * it does not offer is dropped without an error (measured 2026-10-01: a
 * `thread/start` asking `ultrafast` on a Pro account answers `null` and
 * inherits the account default). So the speed choice, and the door behind it,
 * ask the account that will run the turn.
 */
export class CodexServiceTiersService {
  private serverHosts: CodexServerHostRegistry | null = null
  /** Keyed per `(executionHostId, providerAccountId)`: one account's tiers are not another's. */
  private readonly cached = new Map<string, CodexServiceTiersSnapshot>()
  private readonly inFlight = new Map<
    string,
    Promise<CodexServiceTiersSnapshot>
  >()

  constructor(private readonly options: CodexServiceTiersServiceOptions = {}) {}

  /** Provider detection runs after construction, so the pool arrives later. */
  setServerHosts(serverHosts: CodexServerHostRegistry | null): void {
    this.serverHosts = serverHosts
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private async readModelList(
    account: CodexAccountEnvTarget | null,
  ): Promise<unknown> {
    if (this.options.readModelList) return this.options.readModelList(account)
    if (!this.serverHosts?.hasBinary()) {
      throw new Error('Codex CLI was not detected.')
    }
    return this.serverHosts
      .get({ account, executionHostId: account?.executionHostId })
      .run((rpc) =>
        rpc.request('model/list', { includeHidden: false, limit: 100 }),
      )
  }

  private isWarmingUp(
    scope: CodexServiceTiersRequestScope | undefined,
    account: CodexAccountEnvTarget | null,
  ): boolean {
    if (this.options.isWarmingUp) return this.options.isWarmingUp(account)
    return (
      this.serverHosts?.isWarmingUp({
        executionHostId: scope?.executionHostId,
        account,
      }) ?? false
    )
  }

  private async read(
    account: CodexAccountEnvTarget | null,
    key: string,
  ): Promise<CodexServiceTiersSnapshot> {
    const checkedAt = new Date(this.now()).toISOString()
    try {
      const result = (await this.readModelList(account)) as {
        data?: unknown
      } | null
      const snapshot: CodexServiceTiersSnapshot = {
        status: 'available',
        models: mapCodexServiceTiers(result?.data),
        checkedAt,
      }
      this.cached.set(key, snapshot)
      return snapshot
    } catch (error) {
      // Not cached: the next ask tries again rather than repeating a failure
      // for five minutes, and an unread list claims no tiers.
      return {
        status: 'unavailable',
        reason:
          error instanceof Error
            ? error.message
            : "Couldn't read which speeds this account offers.",
        checkedAt,
      }
    }
  }

  async getTiers(
    options: {
      forceRefresh?: boolean
      scope?: CodexServiceTiersRequestScope
    } = {},
  ): Promise<CodexServiceTiersSnapshot> {
    const accountId = options.scope?.providerAccountId ?? null
    const key = `${options.scope?.executionHostId ?? 'local'}::${accountId ?? 'ambient-default'}`
    const account = this.options.resolveAccount?.(accountId) ?? null

    const cached = this.cached.get(key)
    if (
      !options.forceRefresh &&
      cached &&
      this.now() - Date.parse(cached.checkedAt) <
        CODEX_SERVICE_TIERS_CACHE_TTL_MS
    ) {
      return cached
    }

    if (this.isWarmingUp(options.scope, account)) {
      return {
        status: 'warming-up',
        checkedAt: new Date(this.now()).toISOString(),
      }
    }

    const running = this.inFlight.get(key)
    if (running) return running
    const read = this.read(account, key).finally(() => {
      this.inFlight.delete(key)
    })
    this.inFlight.set(key, read)
    return read
  }
}
