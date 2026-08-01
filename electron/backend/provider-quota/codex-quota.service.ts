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

function codexHome(): string {
  const override = process.env.CODEX_HOME?.trim()
  return override ? override : join(homedir(), '.codex')
}

async function readCodexAuthTokens(): Promise<CodexAuthTokens> {
  const authPath = join(codexHome(), 'auth.json')
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
export type CodexRateLimitsReader = () => Promise<unknown>

/** Reads the ChatGPT tokens for the scrape fallback. Injectable so tests do
 * not depend on whether the machine running them has a real `~/.codex/auth.json`. */
export type CodexAuthTokensReader = () => Promise<CodexAuthTokens>

export interface CodexQuotaServiceOptions {
  jsonGet?: JsonGet
  readRateLimits?: CodexRateLimitsReader
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
export class CodexQuotaService {
  private cached: ProviderQuotaSnapshot | null = null
  private binaryPath: string | null = null
  /**
   * A cold read spawns a codex app-server and can take ~30s, so concurrent
   * callers share one in-flight read instead of each paying for their own
   * process and round trip.
   */
  private inFlight: Promise<ProviderQuotaSnapshot> | null = null

  constructor(private readonly options: CodexQuotaServiceOptions = {}) {}

  /** Provider detection runs after construction, so the path arrives later. */
  setBinaryPath(binaryPath: string | null): void {
    this.binaryPath = binaryPath
  }

  private async readRateLimits(): Promise<unknown> {
    if (this.options.readRateLimits) {
      return this.options.readRateLimits()
    }

    if (!this.binaryPath) {
      throw new Error('Codex CLI was not detected.')
    }

    return new CodexAppServerClient(this.binaryPath, {
      timeoutMs: CODEX_RATE_LIMITS_TIMEOUT_MS,
    }).readRateLimits()
  }

  private async readFromAuthScrape(): Promise<ProviderQuotaSnapshot> {
    const tokens = await (this.options.readAuthTokens ?? readCodexAuthTokens)()
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

  private async readQuota(): Promise<ProviderQuotaSnapshot> {
    try {
      let snapshot: ProviderQuotaSnapshot
      try {
        snapshot = mapCodexRateLimitsToQuotaSnapshot(
          await this.readRateLimits(),
          new Date().toISOString(),
        )
      } catch (rpcError) {
        this.recordRateLimitsFailure(rpcError)
        snapshot = await this.readFromAuthScrape()
      }

      this.cached = snapshot
      return snapshot
    } catch (err) {
      if (this.cached?.status === 'available') {
        return { ...this.cached, stale: true }
      }

      const message =
        err instanceof Error
          ? err.message
          : 'Codex usage limits are unavailable.'
      this.cached = buildCodexQuotaAuthError(message, new Date().toISOString())
      return this.cached
    }
  }

  async getQuota(options: { forceRefresh?: boolean } = {}) {
    const now = Date.now()
    if (
      !options.forceRefresh &&
      this.cached &&
      now - Date.parse(this.cached.lastCheckedAt) < CODEX_QUOTA_CACHE_TTL_MS
    ) {
      return this.cached
    }

    // A forceRefresh joins an in-flight read rather than starting a second
    // one: the read already under way is as fresh as a new one would be.
    if (this.inFlight) {
      return this.inFlight
    }

    this.inFlight = this.readQuota().finally(() => {
      this.inFlight = null
    })

    return this.inFlight
  }
}
