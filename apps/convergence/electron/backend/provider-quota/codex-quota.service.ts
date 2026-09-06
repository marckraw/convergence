import type { CodexServerHostRegistry } from '../provider/codex/codex-server-host'
import type { ProviderDebugSink } from '../provider-debug/provider-debug-sink'
import { CODEX_QUOTA_CACHE_TTL_MS } from './codex-quota.constants'
import {
  buildCodexQuotaAuthError,
  mapCodexRateLimitsToQuotaSnapshot,
} from './codex-quota.pure'
import type { CodexAccountEnvTarget } from '../provider-account/provider-account-codex-env.pure'
import type { ProviderQuotaSnapshot } from './provider-quota.types'

/** Reads `account/rateLimits/read` from a codex app-server. */
export type CodexRateLimitsReader = (
  account: CodexAccountEnvTarget | null,
) => Promise<unknown>

export interface CodexQuotaServiceOptions {
  readRateLimits?: CodexRateLimitsReader
  /** Resolves the scope's account id to its `CODEX_HOME`. */
  resolveAccount?: (
    accountId: string | null | undefined,
  ) => CodexAccountEnvTarget | null
  debugSink?: ProviderDebugSink
}

/**
 * Quota is read from Codex's own `account/rateLimits/read` on the app's
 * resident app-server, which answers from the CLI's authenticated session, so
 * Convergence never touches the user's raw token.
 *
 * There is no second path. The old fallback — reading `~/.codex/auth.json` and
 * calling an undocumented chatgpt.com endpoint with the user's access token —
 * was reached by *any* RPC failure, so a slow cold start quietly demoted the
 * app to scraping a credential file. It is deleted (constitution A8): a failed
 * read now says it failed.
 */
export interface CodexQuotaRequestScope {
  executionHostId: string
  providerAccountId: string | null
}

export class CodexQuotaService {
  private serverHosts: CodexServerHostRegistry | null = null
  /**
   * Cached per `(executionHostId, providerAccountId)` (ADR 0007, PA8/PA9).
   *
   * Codex's limits are answered by the account's own authenticated session, so
   * they *are* account-specific, and a single cache would report whichever
   * account was read first under every other one's name.
   */
  private readonly cached = new Map<string, ProviderQuotaSnapshot>()
  /**
   * Concurrent callers share one in-flight read rather than each opening their
   * own connection and round trip. Keyed the same way as the cache, so two
   * accounts still read independently.
   */
  private readonly inFlight = new Map<string, Promise<ProviderQuotaSnapshot>>()

  constructor(private readonly options: CodexQuotaServiceOptions = {}) {}

  /** Provider detection runs after construction, so the pool arrives later. */
  setServerHosts(serverHosts: CodexServerHostRegistry | null): void {
    this.serverHosts = serverHosts
  }

  private async readRateLimits(
    account: CodexAccountEnvTarget | null,
  ): Promise<unknown> {
    if (this.options.readRateLimits) {
      return this.options.readRateLimits(account)
    }

    if (!this.serverHosts?.hasBinary()) {
      throw new Error('Codex CLI was not detected.')
    }

    return this.serverHosts
      .get({ account })
      .run((rpc) => rpc.request('account/rateLimits/read', {}))
  }

  /**
   * A failed read is reported, not worked around.
   *
   * It still goes to the debug sink first: the message the user sees is the
   * snapshot's, and a broken RPC path with no trace is undiagnosable.
   */
  private recordRateLimitsFailure(error: unknown): void {
    this.options.debugSink?.record({
      sessionId: 'codex-quota',
      providerId: 'codex',
      at: Date.now(),
      direction: 'in',
      channel: 'response',
      method: 'account/rateLimits/read',
      note: `Codex rate limits RPC failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }

  private async readQuota(
    account: CodexAccountEnvTarget | null,
    key: string,
  ): Promise<ProviderQuotaSnapshot> {
    try {
      const snapshot = mapCodexRateLimitsToQuotaSnapshot(
        await this.readRateLimits(account),
        new Date().toISOString(),
      )
      this.cached.set(key, snapshot)
      return snapshot
    } catch (err) {
      this.recordRateLimitsFailure(err)
      const previous = this.cached.get(key)
      if (previous?.status === 'available') {
        return { ...previous, stale: true }
      }

      const message =
        err instanceof Error
          ? err.message
          : 'Codex usage limits are unavailable.'
      const snapshot = buildCodexQuotaAuthError(
        message,
        new Date().toISOString(),
      )
      this.cached.set(key, snapshot)
      return snapshot
    }
  }

  async getQuota(
    options: { forceRefresh?: boolean; scope?: CodexQuotaRequestScope } = {},
  ) {
    const accountId = options.scope?.providerAccountId ?? null
    const key = `${options.scope?.executionHostId ?? 'local'}::${accountId ?? 'ambient-default'}`
    const account = this.options.resolveAccount?.(accountId) ?? null

    const now = Date.now()
    const cached = this.cached.get(key)
    if (
      !options.forceRefresh &&
      cached &&
      now - Date.parse(cached.lastCheckedAt) < CODEX_QUOTA_CACHE_TTL_MS
    ) {
      return cached
    }

    // A forceRefresh joins an in-flight read rather than starting a second
    // one: the read already under way is as fresh as a new one would be.
    const running = this.inFlight.get(key)
    if (running) return running

    const read = this.readQuota(account, key).finally(() => {
      this.inFlight.delete(key)
    })
    this.inFlight.set(key, read)

    return read
  }
}
