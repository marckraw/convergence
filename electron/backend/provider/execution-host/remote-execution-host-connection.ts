import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { ExecutionHostDaemonCredentialsService } from '../../credentials/execution-host-daemon-credentials.service'
import type { RemoteExecutionHost } from './remote-execution-host'
import {
  RemoteExecutionHostError,
  type RemoteExecutionHostConnection,
  type RemoteExecutionHostConnectionResolver,
  type RemoteExecutionHostProviderInfo,
} from './remote-execution-host.types'

export type RemoteExecutionHostConnectionState =
  | 'connected'
  | 'missing-base-url'
  | 'invalid-base-url'
  | 'missing-token'
  | 'unreachable'
  | 'auth-failed'
  | 'invalid-response'
  | 'daemon-error'

export interface RemoteExecutionHostConnectionResult {
  ok: boolean
  state: RemoteExecutionHostConnectionState
  baseUrl: string | null
  message: string
  providers: RemoteExecutionHostProviderInfo[] | null
}

interface AppSettingsConnectionResolverDeps {
  appSettings: Pick<AppSettingsService, 'getAppSettings'>
  credentials: Pick<ExecutionHostDaemonCredentialsService, 'resolveToken'>
}

/**
 * Resolves the Remote Execution Host endpoint from App Settings and the
 * daemon credentials store at call time, so settings changes apply without
 * rebuilding the host. Throws RemoteExecutionHostError('configuration') when
 * the base URL or token is missing.
 */
export class AppSettingsRemoteExecutionHostConnectionResolver implements RemoteExecutionHostConnectionResolver {
  constructor(private readonly deps: AppSettingsConnectionResolverDeps) {}

  async resolveConnection(): Promise<RemoteExecutionHostConnection> {
    const inspected = await this.inspect()
    if (inspected.state === 'missing-base-url') {
      throw new RemoteExecutionHostError(
        'Remote execution host base URL is not configured.',
        'configuration',
      )
    }
    if (inspected.state === 'missing-token') {
      throw new RemoteExecutionHostError(
        'Remote execution host API token is not configured.',
        'configuration',
      )
    }
    return { baseUrl: inspected.baseUrl!, token: inspected.token! }
  }

  /**
   * Non-throwing configuration check used by the connection test to report
   * which piece of configuration is missing.
   */
  async inspect(): Promise<{
    state: 'ok' | 'missing-base-url' | 'missing-token'
    baseUrl: string | null
    token: string | null
  }> {
    const settings = await this.deps.appSettings.getAppSettings()
    const baseUrl = settings.executionHostRemoteBaseUrl
    if (!baseUrl) {
      return { state: 'missing-base-url', baseUrl: null, token: null }
    }

    const token = (await this.deps.credentials.resolveToken())?.trim() ?? ''
    if (!token) {
      return { state: 'missing-token', baseUrl, token: null }
    }

    return { state: 'ok', baseUrl, token }
  }
}

/**
 * Tests the Remote Execution Host connection end to end: configuration,
 * reachability, authentication, and provider listing. Never throws — every
 * failure maps to a state the settings UI can render.
 */
export async function testRemoteExecutionHostConnection(deps: {
  resolver: AppSettingsRemoteExecutionHostConnectionResolver
  host: RemoteExecutionHost
}): Promise<RemoteExecutionHostConnectionResult> {
  const inspected = await deps.resolver.inspect()
  if (inspected.state === 'missing-base-url') {
    return {
      ok: false,
      state: 'missing-base-url',
      baseUrl: null,
      message: 'Remote execution host base URL is not configured.',
      providers: null,
    }
  }
  if (inspected.state === 'missing-token') {
    return {
      ok: false,
      state: 'missing-token',
      baseUrl: inspected.baseUrl,
      message: 'Remote execution host API token is not configured.',
      providers: null,
    }
  }

  try {
    const providers = await deps.host.refreshProviders()
    return {
      ok: true,
      state: 'connected',
      baseUrl: inspected.baseUrl,
      message: `Connected. ${providers.length} provider${
        providers.length === 1 ? '' : 's'
      } available.`,
      providers,
    }
  } catch (error) {
    return {
      ok: false,
      state: connectionStateForError(error),
      baseUrl: inspected.baseUrl,
      message:
        error instanceof Error
          ? error.message
          : 'Remote execution host returned an unexpected error.',
      providers: null,
    }
  }
}

function connectionStateForError(
  error: unknown,
): RemoteExecutionHostConnectionState {
  if (!(error instanceof RemoteExecutionHostError)) return 'invalid-response'
  switch (error.kind) {
    case 'auth':
      return 'auth-failed'
    case 'network':
      return 'unreachable'
    case 'malformed':
      return 'invalid-response'
    case 'http':
    case 'configuration':
      return 'daemon-error'
  }
}
