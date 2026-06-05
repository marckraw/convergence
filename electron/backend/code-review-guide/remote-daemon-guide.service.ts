import type { AppSettingsService } from '../app-settings/app-settings.service'
import type { GuidedReviewDaemonCredentialsService } from '../credentials/guided-review-daemon-credentials.service'
import {
  buildRemoteCodeReviewGuideRequestBody,
  buildRemoteDaemonUrl,
  parseRemoteCodeReviewGuideGenerateResult,
  parseRemoteDaemonHealth,
  parseRemoteDaemonMeta,
  resolveRemoteDaemonGenerationModel,
  resolveRemoteDaemonBaseUrl,
} from './remote-daemon-guide.pure'
import type {
  RemoteCodeReviewDaemonConnectionResult,
  RemoteCodeReviewDaemonHealth,
  RemoteCodeReviewDaemonMeta,
  RemoteCodeReviewDaemonProviderId,
  RemoteCodeReviewGuideGenerateInput,
  RemoteCodeReviewGuideGenerateResult,
} from './remote-daemon-guide.types'

type FetchFn = typeof fetch

interface RemoteCodeReviewGuideDaemonClientDeps {
  appSettings: Pick<AppSettingsService, 'getAppSettings'>
  credentials: Pick<GuidedReviewDaemonCredentialsService, 'resolveToken'>
  fetch?: FetchFn
}

type RemoteCodeReviewGuideDaemonErrorKind =
  | 'configuration'
  | 'auth'
  | 'network'
  | 'http'
  | 'malformed'

export class RemoteCodeReviewGuideDaemonError extends Error {
  constructor(
    message: string,
    public readonly kind: RemoteCodeReviewGuideDaemonErrorKind,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'RemoteCodeReviewGuideDaemonError'
  }
}

export class RemoteCodeReviewGuideDaemonClient {
  private readonly fetchFn: FetchFn

  constructor(private readonly deps: RemoteCodeReviewGuideDaemonClientDeps) {
    this.fetchFn = deps.fetch ?? fetch
  }

  async testConnection(): Promise<RemoteCodeReviewDaemonConnectionResult> {
    const base = await this.resolveBaseUrlForConnection()
    if (!base.ok) return base.result

    let health: RemoteCodeReviewDaemonHealth | null = null
    let meta: RemoteCodeReviewDaemonMeta | null = null

    try {
      health = parseRemoteDaemonHealth(
        await this.fetchJson(base.baseUrl, '/health'),
      )
    } catch (error) {
      return connectionFailure(error, base.baseUrl, health, meta)
    }

    const token = await this.resolveToken()
    if (!token) {
      return {
        ok: false,
        state: 'missing-token',
        baseUrl: base.baseUrl,
        message: 'Remote daemon API token is not configured.',
        health,
        meta,
      }
    }

    try {
      meta = parseRemoteDaemonMeta(
        await this.fetchJson(base.baseUrl, '/v0/meta', { token }),
      )
    } catch (error) {
      return connectionFailure(error, base.baseUrl, health, meta)
    }

    return {
      ok: true,
      state: 'connected',
      baseUrl: base.baseUrl,
      message: `Connected to ${meta.name}.`,
      health,
      meta,
    }
  }

  async generateGuide(
    input: RemoteCodeReviewGuideGenerateInput,
  ): Promise<RemoteCodeReviewGuideGenerateResult> {
    const baseUrl = await this.resolveBaseUrlOrThrow()
    const token = await this.resolveTokenOrThrow()
    const body = buildRemoteCodeReviewGuideRequestBody(input)

    try {
      return parseRemoteCodeReviewGuideGenerateResult(
        await this.fetchJson(baseUrl, '/v0/code-review-guides/generate', {
          method: 'POST',
          token,
          body,
        }),
      )
    } catch (error) {
      if (error instanceof RemoteCodeReviewGuideDaemonError) throw error
      throw new RemoteCodeReviewGuideDaemonError(
        `Remote daemon returned an invalid guide response: ${formatErrorMessage(
          error,
        )}`,
        'malformed',
        undefined,
        error,
      )
    }
  }

  async resolveGenerationModel(input: {
    provider: RemoteCodeReviewDaemonProviderId
    preferredModel: string
  }): Promise<string> {
    const baseUrl = await this.resolveBaseUrlOrThrow()
    const token = await this.resolveTokenOrThrow()
    const meta = parseRemoteDaemonMeta(
      await this.fetchJson(baseUrl, '/v0/meta', { token }),
    )
    const resolution = resolveRemoteDaemonGenerationModel({
      meta,
      provider: input.provider,
      preferredModel: input.preferredModel,
    })

    if (resolution.ok) return resolution.model

    throw new RemoteCodeReviewGuideDaemonError(
      remoteGenerationModelResolutionMessage(
        resolution.reason,
        input.provider,
        input.preferredModel,
      ),
      'configuration',
    )
  }

  private async resolveBaseUrlForConnection(): Promise<
    | { ok: true; baseUrl: string }
    | { ok: false; result: RemoteCodeReviewDaemonConnectionResult }
  > {
    const settings = await this.deps.appSettings.getAppSettings()
    const resolved = resolveRemoteDaemonBaseUrl(
      settings.guidedReviewRemoteBaseUrl,
    )

    if (resolved.ok) return { ok: true, baseUrl: resolved.baseUrl }

    const state =
      resolved.reason === 'missing' ? 'missing-base-url' : 'invalid-base-url'
    return {
      ok: false,
      result: {
        ok: false,
        state,
        baseUrl: null,
        message:
          resolved.reason === 'missing'
            ? 'Remote daemon base URL is not configured.'
            : 'Remote daemon base URL must be an HTTP(S) URL.',
        health: null,
        meta: null,
      },
    }
  }

  private async resolveBaseUrlOrThrow(): Promise<string> {
    const settings = await this.deps.appSettings.getAppSettings()
    const resolved = resolveRemoteDaemonBaseUrl(
      settings.guidedReviewRemoteBaseUrl,
    )
    if (resolved.ok) return resolved.baseUrl

    throw new RemoteCodeReviewGuideDaemonError(
      resolved.reason === 'missing'
        ? 'Remote daemon base URL is not configured.'
        : 'Remote daemon base URL must be an HTTP(S) URL.',
      'configuration',
    )
  }

  private async resolveTokenOrThrow(): Promise<string> {
    const token = await this.resolveToken()
    if (token) return token

    throw new RemoteCodeReviewGuideDaemonError(
      'Remote daemon API token is not configured.',
      'configuration',
    )
  }

  private async resolveToken(): Promise<string | null> {
    const token = (await this.deps.credentials.resolveToken())?.trim() ?? ''
    return token.length > 0 ? token : null
  }

  private async fetchJson(
    baseUrl: string,
    path: string,
    options: {
      method?: 'GET' | 'POST'
      token?: string
      body?: unknown
    } = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = {}
    if (options.token) {
      headers.Authorization = authorizationHeader(options.token)
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    let response: Response
    try {
      response = await this.fetchFn(buildRemoteDaemonUrl(baseUrl, path), {
        method: options.method ?? 'GET',
        headers,
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      })
    } catch (error) {
      throw new RemoteCodeReviewGuideDaemonError(
        `Remote daemon is unreachable: ${formatErrorMessage(error)}`,
        'network',
        undefined,
        error,
      )
    }

    const parsed = await readJsonResponse(response)
    if (!response.ok) {
      const message = extractDaemonErrorMessage(parsed) ?? response.statusText
      const kind =
        response.status === 401 || response.status === 403 ? 'auth' : 'http'
      throw new RemoteCodeReviewGuideDaemonError(
        message || `Remote daemon request failed with ${response.status}.`,
        kind,
        response.status,
      )
    }

    return parsed
  }
}

function remoteGenerationModelResolutionMessage(
  reason: Exclude<
    ReturnType<typeof resolveRemoteDaemonGenerationModel>,
    { ok: true }
  >['reason'],
  provider: RemoteCodeReviewDaemonProviderId,
  preferredModel: string,
): string {
  switch (reason) {
    case 'missing-preferred-model':
      return 'Remote guide generation requires a model.'
    case 'missing-provider':
      return `Remote daemon does not advertise provider ${provider}.`
    case 'provider-unavailable':
      return `Remote daemon provider ${provider} is unavailable.`
    case 'provider-unauthenticated':
      return `Remote daemon provider ${provider} is not authenticated.`
    case 'missing-provider-models':
      return `Remote daemon provider ${provider} does not advertise any models for ${preferredModel}.`
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return {}

  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (!response.ok) {
      return { error: text.trim() }
    }

    throw new RemoteCodeReviewGuideDaemonError(
      'Remote daemon returned malformed JSON.',
      'malformed',
      response.status,
      error,
    )
  }
}

function extractDaemonErrorMessage(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const error = (value as { error?: unknown }).error
  return typeof error === 'string' && error.trim().length > 0
    ? error.trim()
    : null
}

function connectionFailure(
  error: unknown,
  baseUrl: string,
  health: RemoteCodeReviewDaemonHealth | null,
  meta: RemoteCodeReviewDaemonMeta | null,
): RemoteCodeReviewDaemonConnectionResult {
  if (error instanceof RemoteCodeReviewGuideDaemonError) {
    switch (error.kind) {
      case 'auth':
        return failure(
          'auth-failed',
          error.message || 'Remote daemon authentication failed.',
          baseUrl,
          health,
          meta,
        )
      case 'network':
        return failure('unreachable', error.message, baseUrl, health, meta)
      case 'malformed':
        return failure('invalid-response', error.message, baseUrl, health, meta)
      case 'http':
        return failure('daemon-error', error.message, baseUrl, health, meta)
      case 'configuration':
        return failure('daemon-error', error.message, baseUrl, health, meta)
    }
  }

  return failure(
    'invalid-response',
    `Remote daemon returned an invalid response: ${formatErrorMessage(error)}`,
    baseUrl,
    health,
    meta,
  )
}

function failure(
  state: RemoteCodeReviewDaemonConnectionResult['state'],
  message: string,
  baseUrl: string,
  health: RemoteCodeReviewDaemonHealth | null,
  meta: RemoteCodeReviewDaemonMeta | null,
): RemoteCodeReviewDaemonConnectionResult {
  return {
    ok: false,
    state,
    baseUrl,
    message,
    health,
    meta,
  }
}

function authorizationHeader(token: string): string {
  const trimmed = token.trim()
  return /^Bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
