import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { ExecutionHostDaemonCredentialsService } from '../../credentials/execution-host-daemon-credentials.service'
import type { ProviderDebugSink } from '../../provider-debug/provider-debug-sink'
import { AppSettingsRemoteExecutionHostConnectionResolver } from './remote-execution-host-connection'
import { RemoteExecutionHost } from './remote-execution-host'
import type { RemoteExecutionHostRegistry } from './remote-execution-host.types'

interface RemoteExecutionHostRegistryDeps {
  appSettings: Pick<AppSettingsService, 'getAppSettings'>
  credentials: Pick<ExecutionHostDaemonCredentialsService, 'resolveToken'>
  fetch?: typeof fetch
  /** Forwarded to every host: the stream cursor each run persists. */
  onEventSeq?: (sessionId: string, seq: number) => void
  debugSink?: ProviderDebugSink
}

/**
 * Registry (MAR-2620): one `RemoteExecutionHost` per Execution Host Endpoint,
 * keyed by the Endpoint id a session records.
 *
 * The Strategy this era needs was already there — a host, selected by data —
 * and the only thing missing was that the data reached it. One host per
 * Endpoint rather than one host threading an id through each call, because a
 * host is not stateless: it caches that daemon's provider listing and holds
 * that daemon's handshake. A single instance serving several daemons would
 * answer `capabilitiesFor` from whichever one refreshed last.
 *
 * Hosts are built on first use and kept, so a session that reattaches after a
 * restart and a turn sent a minute later speak to the same instance and share
 * its cache. Each new host starts listing that cache immediately, and
 * `whenReady` is how a caller waits for the listing rather than hoping it
 * arrived: `start()` refuses a provider it has never listed, so a host born
 * cold would reject the first turn on an Endpoint added after boot.
 *
 * Base URL and token are still read per call by the connection resolver, so
 * editing an Endpoint's address applies without rebuilding anything.
 */
export class AppSettingsRemoteExecutionHostRegistry implements RemoteExecutionHostRegistry {
  private readonly hosts = new Map<string, RemoteExecutionHost>()
  /**
   * The listing in flight for each Endpoint, resolving to why it failed or to
   * null when it landed. It never rejects: most callers only start it, and a
   * rejected promise nobody awaits is an unhandled rejection.
   */
  private readonly listings = new Map<string, Promise<Error | null>>()

  constructor(private readonly deps: RemoteExecutionHostRegistryDeps) {}

  hostFor(endpointId: string): RemoteExecutionHost {
    const existing = this.hosts.get(endpointId)
    if (existing) return existing

    const host = new RemoteExecutionHost({
      connection: this.resolverFor(endpointId),
      fetch: this.deps.fetch,
      onEventSeq: this.deps.onEventSeq,
      debugSink: this.deps.debugSink,
    })
    this.hosts.set(endpointId, host)
    this.beginListing(endpointId, host)
    return host
  }

  /**
   * Settles once this Endpoint has answered with its provider listing, and
   * throws with why when it never did (MAR-2620).
   *
   * The listing is a round trip to the daemon, started when the host is built
   * and read synchronously by `start()`. Between those two moments a turn on a
   * freshly added Endpoint is refused for a provider the daemon has, so
   * whoever is about to start a session waits here for the request already in
   * flight. Not a retry and not a sleep: the same promise, awaited by the one
   * path that cannot proceed without it.
   */
  async whenReady(endpointId: string): Promise<void> {
    const host = this.hostFor(endpointId)
    const failure = await (this.listings.get(endpointId) ??
      this.beginListing(endpointId, host))
    if (failure) throw failure
  }

  /**
   * Starts one Endpoint's provider listing and records it as the attempt
   * `whenReady` waits on.
   */
  private beginListing(
    endpointId: string,
    host: RemoteExecutionHost,
  ): Promise<Error | null> {
    const attempt: Promise<Error | null> = host.refreshProviders().then(
      () => null,
      (error: unknown) => {
        // A failed listing must not poison the Endpoint. Forgetting the
        // attempt makes the next turn ask again, so a daemon that was down at
        // boot works as soon as it is up -- without restarting Convergence,
        // and without this becoming a retry loop nobody asked for.
        if (this.listings.get(endpointId) === attempt) {
          this.listings.delete(endpointId)
        }
        return error instanceof Error ? error : new Error(String(error))
      },
    )
    this.listings.set(endpointId, attempt)
    return attempt
  }

  /**
   * The connection resolver for one Endpoint. Exposed because the settings
   * connection test reports *which* piece of configuration is missing, which
   * the host itself only knows how to throw about.
   */
  resolverFor(
    endpointId: string,
  ): AppSettingsRemoteExecutionHostConnectionResolver {
    return new AppSettingsRemoteExecutionHostConnectionResolver({
      appSettings: this.deps.appSettings,
      credentials: this.deps.credentials,
      endpointId,
    })
  }

  /**
   * Builds the host for every configured Endpoint, starting each one's
   * provider listing. Called at boot so the first remote turn usually finds
   * the listing already there rather than waiting on it -- `whenReady` is what
   * makes waiting correct when it is not.
   */
  async primeConfiguredEndpoints(): Promise<void> {
    const settings = await this.deps.appSettings.getAppSettings()
    for (const endpoint of settings.executionHostEndpoints) {
      this.hostFor(endpoint.id)
    }
  }
}
