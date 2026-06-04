import { request as httpsRequest } from 'https'
import {
  describeCursorAdminApiAuthFailure,
  validateCursorAdminApiKey,
} from '../credentials/cursor-credentials.pure'
import { CursorCredentialsService } from '../credentials/cursor-credentials.service'
import {
  CURSOR_QUOTA_CACHE_TTL_MS,
  CURSOR_TEAM_SPEND_URL,
} from './cursor-quota.constants'
import {
  buildCursorQuotaUnavailableSnapshot,
  mapCursorTeamSpendPayloadToQuotaSnapshot,
} from './cursor-quota.pure'
import type { ProviderQuotaSnapshot } from './provider-quota.types'

interface JsonPostRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

type JsonPost = (request: JsonPostRequest) => Promise<unknown>

function postJson(request: JsonPostRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(request.url)
    const body = JSON.stringify(request.body)
    const req = httpsRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          ...request.headers,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const status = res.statusCode ?? 0
          const responseBody = Buffer.concat(chunks).toString('utf8')
          if (status < 200 || status >= 300) {
            if (status === 401 || status === 403) {
              reject(new Error(describeCursorAdminApiAuthFailure()))
              return
            }
            reject(
              new Error(
                `Cursor team spend request failed with HTTP ${status}.`,
              ),
            )
            return
          }

          try {
            resolve(JSON.parse(responseBody))
          } catch {
            reject(new Error('Cursor team spend response was not valid JSON.'))
          }
        })
      },
    )

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
}

export class CursorQuotaService {
  private cached: ProviderQuotaSnapshot | null = null

  constructor(
    private readonly credentials = new CursorCredentialsService(),
    private readonly jsonPost: JsonPost = postJson,
  ) {}

  async getQuota(options: { forceRefresh?: boolean } = {}) {
    const now = Date.now()
    if (
      !options.forceRefresh &&
      this.cached &&
      now - Date.parse(this.cached.lastCheckedAt) < CURSOR_QUOTA_CACHE_TTL_MS
    ) {
      return this.cached
    }

    try {
      const { apiKey, email } = await this.credentials.resolveCredentials()
      if (!apiKey) {
        throw new Error(
          'Cursor does not expose individual usage through ACP, CLI, or a public API. Save a Cursor Admin API key in Provider credentials to show official team spend data, or open the Cursor dashboard for individual usage.',
        )
      }
      const validationError = validateCursorAdminApiKey(apiKey)
      if (validationError) {
        throw new Error(validationError)
      }

      const payload = await this.jsonPost({
        url: CURSOR_TEAM_SPEND_URL,
        headers: {
          Accept: 'application/json',
          Authorization: basicAuthHeader(apiKey),
          'User-Agent': 'convergence-cursor-usage',
        },
        body: {
          searchTerm: email ?? undefined,
          page: 1,
          pageSize: 100,
        },
      })
      const snapshot = mapCursorTeamSpendPayloadToQuotaSnapshot(
        payload,
        new Date().toISOString(),
        { email },
      )
      this.cached = snapshot
      return snapshot
    } catch (err) {
      if (this.cached?.status === 'available') {
        return { ...this.cached, stale: true }
      }

      const message =
        err instanceof Error ? err.message : 'Cursor usage is unavailable.'
      this.cached = buildCursorQuotaUnavailableSnapshot(
        message,
        new Date().toISOString(),
      )
      return this.cached
    }
  }
}
