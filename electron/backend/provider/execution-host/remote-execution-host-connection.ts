import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { ExecutionHostDaemonCredentialsService } from '../../credentials/execution-host-daemon-credentials.service'
import type { EndpointHandshakeResult } from './execution-host-handshake.types'
import type { RemoteExecutionHost } from './remote-execution-host'
import { describeRemoteProviderListing } from './remote-execution-host.pure'
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
  | 'incompatible'

/**
 * What the daemon said about itself during the `/health` handshake. Null means
 * it did not answer one — an older daemon, or a proxy that hides the route —
 * which is "unknown", not "unsupported".
 */
export interface RemoteExecutionHostDaemonSummary {
  version: string | null
  apiVersion: string | null
  protocolCapabilities: string[]
}

export interface RemoteExecutionHostConnectionResult {
  ok: boolean
  state: RemoteExecutionHostConnectionState
  baseUrl: string | null
  message: string
  providers: RemoteExecutionHostProviderInfo[] | null
  daemon: RemoteExecutionHostDaemonSummary | null
}

interface AppSettingsConnectionResolverDeps {
  appSettings: Pick<AppSettingsService, 'getAppSettings'>
  credentials: Pick<ExecutionHostDaemonCredentialsService, 'resolveToken'>
  /** The Endpoint this resolver speaks for. Never optional: see the class. */
  endpointId: string
}

/**
 * Resolves one named Endpoint's base URL and token from App Settings and the
 * daemon credentials store at call time, so settings changes apply without
 * rebuilding the host. Throws RemoteExecutionHostError('configuration') when
 * the base URL or token is missing.
 *
 * The Endpoint is fixed at construction and looked up by id, never by
 * position (MAR-2620). Reading whichever Endpoint happens to be first would
 * make the id a fact that is checked upstream and then thrown away: a session
 * recording Endpoint B would validate, and post to Endpoint A. One resolver
 * serves exactly one machine, and `AppSettingsRemoteExecutionHostRegistry`
 * builds one per Endpoint.
 */
export class AppSettingsRemoteExecutionHostConnectionResolver implements RemoteExecutionHostConnectionResolver {
  constructor(private readonly deps: AppSettingsConnectionResolverDeps) {}

  /** Which machine this resolver answers for. */
  get endpointId(): string {
    return this.deps.endpointId
  }

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
    const endpoint =
      settings.executionHostEndpoints.find(
        (candidate) => candidate.id === this.deps.endpointId,
      ) ?? null
    if (!endpoint) {
      return { state: 'missing-base-url', baseUrl: null, token: null }
    }

    const token =
      (await this.deps.credentials.resolveToken(endpoint.id))?.trim() ?? ''
    if (!token) {
      return { state: 'missing-token', baseUrl: endpoint.baseUrl, token: null }
    }

    return { state: 'ok', baseUrl: endpoint.baseUrl, token }
  }
}

/**
 * Tests the Remote Execution Host connection end to end: configuration,
 * reachability, authentication, and provider listing. Never throws — every
 * failure maps to a state the settings UI can render.
 */
export async function testRemoteExecutionHostConnection(deps: {
  resolver: AppSettingsRemoteExecutionHostConnectionResolver
  /**
   * The host for this Endpoint, asked for only once the configuration check
   * above has passed.
   *
   * A thunk rather than the host itself: the registry refuses to mint one for
   * an Endpoint that is not configured (MAR-2682), and that is exactly the case
   * this function answers with `missing-base-url` -- a sentence naming what is
   * absent. Taking the host eagerly would build it before the check that says
   * it should not exist, and turn the clearest message the settings row has
   * into a raw rejection.
   */
  host: () => RemoteExecutionHost
}): Promise<RemoteExecutionHostConnectionResult> {
  const inspected = await deps.resolver.inspect()
  if (inspected.state === 'missing-base-url') {
    return {
      ok: false,
      state: 'missing-base-url',
      baseUrl: null,
      message: 'Remote execution host base URL is not configured.',
      providers: null,
      daemon: null,
    }
  }
  if (inspected.state === 'missing-token') {
    return {
      ok: false,
      state: 'missing-token',
      baseUrl: inspected.baseUrl,
      message: 'Remote execution host API token is not configured.',
      providers: null,
      daemon: null,
    }
  }

  try {
    const host = deps.host()
    const providers = await host.refreshProviders()
    const handshake = host.handshake()
    const daemon = daemonSummary(handshake)

    // The handshake only ever vetoes a connection the listing already allowed,
    // and only for the one thing it can prove: a daemon speaking a protocol
    // this build cannot read. Anything else it reports is added detail, never
    // a downgrade — a daemon that serves no /health at all connects exactly as
    // it did before.
    if (handshake?.status === 'incompatible') {
      return {
        ok: false,
        state: 'incompatible',
        baseUrl: inspected.baseUrl,
        message:
          handshake.detail ??
          'Remote execution host speaks a protocol this app does not support.',
        providers,
        daemon,
      }
    }

    return {
      ok: true,
      state: 'connected',
      baseUrl: inspected.baseUrl,
      // Counted by what this daemon will run, not by what it listed: the same
      // question the option row asks, from the same derivation, so the two
      // surfaces cannot report different numbers about one machine (MAR-2682).
      message: `Connected. ${describeRemoteProviderListing(providers)}`,
      providers,
      daemon,
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
      daemon: null,
    }
  }
}

function daemonSummary(
  handshake: EndpointHandshakeResult | null,
): RemoteExecutionHostDaemonSummary | null {
  if (!handshake) return null
  return {
    version: handshake.daemonVersion,
    apiVersion: handshake.apiVersion,
    protocolCapabilities: handshake.executionProtocolCapabilities,
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
