import type {
  RemoteExecutionHostConnection,
  RemoteExecutionHostConnectionResolver,
} from './remote-execution-host.types'
import { RemoteExecutionHostError } from './remote-execution-host.types'
import { daemonConfigurationFingerprint } from './remote-execution-host.pure'

/**
 * Where an Endpoint's base URL is read from, and where an observation of its
 * configuration is reported back to (MAR-2737).
 *
 * A port and not an import: this package must not know Convergence's App
 * Settings service, its SQLite row, or its epoch ledger. The shape is exactly
 * the `Pick` the resolver already took, so the app's own service satisfies it
 * structurally with no adapter and no rename -- and a second app can satisfy it
 * from a config file, an env var, or a literal.
 *
 * `getAppSettings` is deliberately narrow: the resolver reads one thing from
 * the settings, the Endpoint list, and widening the port to the app's whole
 * `AppSettings` would drag every unrelated preference across the boundary.
 */
export interface EndpointConfigurationSource {
  getAppSettings(): Promise<{
    executionHostEndpoints: readonly { id: string; baseUrl: string }[]
  }>
  /**
   * Records the configuration a resolution just happened under. The caller
   * decides what to do with it; this package only guarantees that *every*
   * resolution reports one, successes and refusals alike (see below).
   */
  observeExecutionHostConfiguration(
    endpointId: string,
    configurationFingerprint: string,
  ): void
}

/**
 * Where an Endpoint's bearer token is read from (MAR-2737).
 *
 * The second port, separate from the first because a token is not a setting: it
 * lives in a Keychain in Convergence and may live anywhere else in another app.
 * `null` means this Endpoint has no token, which is a configuration answer and
 * not a failure to look.
 */
export interface TokenSource {
  resolveToken(endpointId: string): Promise<string | null>
}

interface AppSettingsConnectionResolverDeps {
  appSettings: EndpointConfigurationSource
  credentials: TokenSource
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

  /**
   * The base URL and token this Endpoint is configured with right now, and the
   * one place either is learned (MAR-2620).
   *
   * Every resolution is also an *observation*: the configuration epoch the
   * renderer keys its catalogs by moves here and nowhere else (MAR-2689 round
   * 6). The refusals observe too, and deliberately — an Endpoint whose token
   * has just been deleted is not configured the way the catalog on screen was
   * read under, and a resolver that only reported successes would leave that
   * catalog in force.
   */
  async resolveConnection(): Promise<RemoteExecutionHostConnection> {
    const inspected = await this.inspect()
    const connection =
      inspected.state === 'ok'
        ? { baseUrl: inspected.baseUrl!, token: inspected.token! }
        : null
    this.deps.appSettings.observeExecutionHostConfiguration(
      this.deps.endpointId,
      daemonConfigurationFingerprint(connection),
    )
    if (!connection) {
      throw new RemoteExecutionHostError(
        inspected.state === 'missing-token'
          ? 'Remote execution host API token is not configured.'
          : 'Remote execution host base URL is not configured.',
        'configuration',
      )
    }
    return connection
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
