import { request as httpsRequest } from 'https'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { CodexAppServerClient } from '../provider/codex/codex-app-server-client'
import type { ProviderDebugSink } from '../provider-debug/provider-debug-sink'
import {
  CODEX_QUOTA_CACHE_TTL_MS,
  CODEX_RATE_LIMITS_TIMEOUT_MS,
  CODEX_USAGE_URL,
} from './codex-quota.constants'
import {
  buildCodexQuotaAuthError,
  mapCodexRateLimitsToQuotaSnapshot,
  mapCodexUsagePayloadToQuotaSnapshot,
  readRecord,
} from './codex-quota.pure'
import type { CodexAccountEnvTarget } from '../provider-account/provider-account-codex-env.pure'
import type { ProviderQuotaSnapshot } from './provider-quota.types'

interface CodexAuthTokens {
  accessToken: string
  accountId: string | null
}

interface JsonGetRequest {
  url: string
  headers: Record<string, string>
}

type JsonGet = (request: JsonGetRequest) => Promise<unknown>

/**
 * The home the credential lives in. An enrolled account names its own (ADR
 * 0007, PA9); with none, this is the ambient `~/.codex` login, honouring a
 * `CODEX_HOME` the user set themselves exactly as it always did.
 */
function codexHome(account: CodexAccountEnvTarget | null): string {
  if (account) return account.configDir
  const override = process.env.CODEX_HOME?.trim()
  return override ? override : join(homedir(), '.codex')
}

async function readCodexAuthTokens(
  account: CodexAccountEnvTarget | null = null,
): Promise<CodexAuthTokens> {
  const authPath = join(codexHome(account), 'auth.json')
  let raw: string
  try {
    raw = await fs.readFile(authPath, 'utf8')
  } catch {
    throw new Error('Codex ChatGPT auth was not found. Run `codex login`.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Codex auth.json is not valid JSON. Run `codex login`.')
  }

  const root = readRecord(parsed)
  const tokens = readRecord(root?.tokens)
  if (!tokens) {
    throw new Error(
      'Codex is not using ChatGPT auth. Run `codex login` to enable usage limits.',
    )
  }

  const accessToken = tokens?.access_token
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    throw new Error(
      'Codex is not using ChatGPT auth. Run `codex login` to enable usage limits.',
    )
  }

  const idToken = readRecord(tokens.id_token)
  const accountId =
    typeof tokens.account_id === 'string'
      ? tokens.account_id
      : typeof idToken?.chatgpt_account_id === 'string'
        ? idToken.chatgpt_account_id
        : null

  return {
    accessToken,
    accountId,
  }
}

function getJson(request: JsonGetRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(request.url)
    const req = httpsRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: request.headers,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const status = res.statusCode ?? 0
          const body = Buffer.concat(chunks).toString('utf8')
          if (status < 200 || status >= 300) {
            if (status === 401) {
              reject(
                new Error(
                  'Codex ChatGPT auth is expired. Run `codex login` and try again.',
                ),
              )
              return
            }
            reject(new Error(`Codex usage request failed with HTTP ${status}.`))
            return
          }

          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new Error('Codex usage response was not valid JSON.'))
          }
        })
      },
    )

    req.on('error', reject)
    req.end()
  })
}

/** Reads `account/rateLimits/read` from a codex app-server. */
export type CodexRateLimitsReader = (
  account: CodexAccountEnvTarget | null,
) => Promise<unknown>

/** Reads the ChatGPT tokens for the scrape fallback. Injectable so tests do
 * not depend on whether the machine running them has a real `~/.codex/auth.json`. */
export type CodexAuthTokensReader = (
  account: CodexAccountEnvTarget | null,
) => Promise<CodexAuthTokens>

export interface CodexQuotaServiceOptions {
  jsonGet?: JsonGet
  readRateLimits?: CodexRateLimitsReader
  /** Resolves the scope's account id to its `CODEX_HOME`. */
  resolveAccount?: (
    accountId: string | null | undefined,
  ) => CodexAccountEnvTarget | null
  readAuthTokens?: CodexAuthTokensReader
  debugSink?: ProviderDebugSink
}

/**
 * Quota is read from Codex's own `account/rateLimits/read` app-server method,
 * which answers from the CLI's authenticated session. The older path — reading
 * `~/.codex/auth.json` and calling an undocumented chatgpt.com endpoint with
 * the user's raw access token — survives only as a fallback for codex builds
 * that do not answer the method.
 */
export interface CodexQuotaRequestScope {
  executionHostId: string
  providerAccountId: string | null
}

export class CodexQuotaService {
  private binaryPath: string | null = null
  /**
   * Cached per `(executionHostId, providerAccountId)` (ADR 0007, PA8/PA9).
   *
   * Codex's limits are answered by the account's own authenticated session, so
   * they *are* account-specific, and a single cache would report whichever
   * account was read first under every other one's name.
   */
  private readonly cached = new Map<string, ProviderQuotaSnapshot>()
  /**
   * A cold read spawns a codex app-server and can take ~30s, so concurrent
   * callers share one in-flight read instead of each paying for their own
   * process and round trip. Keyed the same way, so two accounts still read
   * independently.
   */
  private readonly inFlight = new Map<string, Promise<ProviderQuotaSnapshot>>()

  constructor(private readonly options: CodexQuotaServiceOptions = {}) {}

  /** Provider detection runs after construction, so the path arrives later. */
  setBinaryPath(binaryPath: string | null): void {
    this.binaryPath = binaryPath
  }

  private async readRateLimits(
    account: CodexAccountEnvTarget | null,
  ): Promise<unknown> {
    if (this.options.readRateLimits) {
      return this.options.readRateLimits(account)
    }

    if (!this.binaryPath) {
      throw new Error('Codex CLI was not detected.')
    }

    return new CodexAppServerClient(this.binaryPath, {
      timeoutMs: CODEX_RATE_LIMITS_TIMEOUT_MS,
      account,
    }).readRateLimits()
  }

  private async readFromAuthScrape(
    account: CodexAccountEnvTarget | null,
  ): Promise<ProviderQuotaSnapshot> {
    const tokens = await (this.options.readAuthTokens ?? readCodexAuthTokens)(
      account,
    )
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${tokens.accessToken}`,
      'User-Agent': 'convergence-codex-usage',
    }
    if (tokens.accountId) {
      headers['ChatGPT-Account-Id'] = tokens.accountId
    }

    const payload = await (this.options.jsonGet ?? getJson)({
      url: CODEX_USAGE_URL,
      headers,
    })
    return mapCodexUsagePayloadToQuotaSnapshot(
      payload,
      new Date().toISOString(),
    )
  }

  /**
   * The RPC failure is not surfaced to the user — the scrape's messages are
   * more actionable ("run `codex login`") — but a silently broken RPC path is
   * undiagnosable, so it goes to the debug sink before we fall back.
   */
  private recordRateLimitsFailure(error: unknown): void {
    this.options.debugSink?.record({
      sessionId: 'codex-quota',
      providerId: 'codex',
      at: Date.now(),
      direction: 'in',
      channel: 'response',
      method: 'account/rateLimits/read',
      note: `Codex rate limits RPC failed; falling back to the auth.json scrape: ${
        error instanceof Error ? error.message : String(error)
      }`,
    })
  }

  private async readQuota(
    account: CodexAccountEnvTarget | null,
    key: string,
  ): Promise<ProviderQuotaSnapshot> {
    try {
      let snapshot: ProviderQuotaSnapshot
      try {
        snapshot = mapCodexRateLimitsToQuotaSnapshot(
          await this.readRateLimits(account),
          new Date().toISOString(),
        )
      } catch (rpcError) {
        this.recordRateLimitsFailure(rpcError)
        snapshot = await this.readFromAuthScrape(account)
      }

      this.cached.set(key, snapshot)
      return snapshot
    } catch (err) {
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
