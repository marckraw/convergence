import { request as httpsRequest } from 'https'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  CODEX_QUOTA_CACHE_TTL_MS,
  CODEX_USAGE_URL,
} from './codex-quota.constants'
import {
  buildCodexQuotaAuthError,
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

export class CodexQuotaService {
  private cached: ProviderQuotaSnapshot | null = null

  constructor(private readonly jsonGet: JsonGet = getJson) {}

  async getQuota(options: { forceRefresh?: boolean } = {}) {
    const now = Date.now()
    if (
      !options.forceRefresh &&
      this.cached &&
      now - Date.parse(this.cached.lastCheckedAt) < CODEX_QUOTA_CACHE_TTL_MS
    ) {
      return this.cached
    }

    try {
      const tokens = await readCodexAuthTokens()
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
        'User-Agent': 'convergence-codex-usage',
      }
      if (tokens.accountId) {
        headers['ChatGPT-Account-Id'] = tokens.accountId
      }

      const payload = await this.jsonGet({
        url: CODEX_USAGE_URL,
        headers,
      })
      const snapshot = mapCodexUsagePayloadToQuotaSnapshot(
        payload,
        new Date().toISOString(),
      )
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
}
