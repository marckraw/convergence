import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { ExecutionHostDaemonCredentialsService } from '../../credentials/execution-host-daemon-credentials.service'
import type { ProviderDebugSink } from '../../provider-debug/provider-debug-sink'
import { AppSettingsRemoteExecutionHostConnectionResolver } from './remote-execution-host-connection'
import { RemoteExecutionHost } from './remote-execution-host'
import {
  RemoteExecutionHostError,
  type RemoteExecutionHostRegistry,
} from './remote-execution-host.types'

interface RemoteExecutionHostRegistryDeps {
  appSettings: Pick<
    AppSettingsService,
    'getAppSettings' | 'hasExecutionHostEndpoint'
  >
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
 * Base URL and token are read per call by the connection resolver, so editing
 * an Endpoint's address applies without rebuilding anything — and the host's
 * own cache is stored with the configuration it was read from, so the old
 * daemon's provider listing stops being readable as soon as the new address is
 * observed. Nothing here clears it. That is deliberate: this registry held the
 * one memo that could have gone stale on its own — a per-Endpoint "the listing
 * already landed" promise — and it is gone, because the host that owns the
 * cache is the only thing that can say whether the cache is still about the
 * machine in force.
 */
export class AppSettingsRemoteExecutionHostRegistry implements RemoteExecutionHostRegistry {
  private readonly hosts = new Map<string, RemoteExecutionHost>()

  constructor(private readonly deps: RemoteExecutionHostRegistryDeps) {}

  /**
   * The host for one Endpoint, built on first use -- and never for an Endpoint
   * that is not configured (MAR-2682).
   *
   * The check is here rather than at each door because minting is what has to
   * be refused, and only this method mints. A caller that checked membership
   * itself would still be checking across an await: `ProviderCatalogService`
   * lists the configured ids and then asks for a host, and a removal landing in
   * that gap would not merely answer stale -- it would cache a host for a
   * machine that is gone and `prime` would dial it. Read at the moment of the
   * mint, synchronously, there is no gap to land in.
   *
   * An already-built host is handed back without the check: it is the same
   * instance a session in flight is streaming through, and its own connection
   * resolver refuses the next call once the Endpoint's row is gone.
   */
  hostFor(endpointId: string): RemoteExecutionHost {
    const existing = this.hosts.get(endpointId)
    if (existing) return existing

    if (!this.deps.appSettings.hasExecutionHostEndpoint(endpointId)) {
      throw new RemoteExecutionHostError(
        `Execution host endpoint "${endpointId}" is not configured.`,
        'configuration',
      )
    }

    const host = new RemoteExecutionHost({
      connection: this.resolverFor(endpointId),
      fetch: this.deps.fetch,
      onEventSeq: this.deps.onEventSeq,
      debugSink: this.deps.debugSink,
    })
    this.hosts.set(endpointId, host)
    this.prime(host)
    return host
  }

  /**
   * Settles once this Endpoint has answered with a provider listing read from
   * the address it points at now, and throws with why when it never did
   * (MAR-2620).
   *
   * The listing is a round trip to the daemon, started when the host is built
   * and read synchronously by `start()`. Between those two moments a turn on a
   * freshly added Endpoint is refused for a provider the daemon has, so
   * whoever is about to start a session waits here for the request already in
   * flight. The same wait covers the other way that cache can be wrong: an
   * Endpoint whose base URL was edited has a listing from the machine it used
   * to name, and this does not resolve against it. Not a retry and not a
   * sleep: at most one round trip, and none at all when nothing changed.
   */
  async whenReady(endpointId: string): Promise<void> {
    await this.hostFor(endpointId).ensureListed()
  }

  /**
   * Starts a host's listing without waiting for it.
   *
   * The failure is discarded rather than dropped: nobody is waiting on a prime,
   * and the host keeps why it failed and re-raises it at the next `whenReady`
   * or the refusal `start()` gives. Rethrowing here would only be an unhandled
   * rejection saying the same thing to no one.
   */
  private prime(host: RemoteExecutionHost): void {
    void host.ensureListed().catch(() => {})
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
   * Brings every configured Endpoint's listing up to date with its current
   * configuration, building hosts that do not exist yet. Called at boot so the
   * first remote turn usually finds the listing already there rather than
   * waiting on it, and after a settings Save so an Endpoint that was just added
   * or just moved is listed before anyone sends to it. An Endpoint whose
   * configuration did not change costs a settings read and no round trip.
   */
  async primeConfiguredEndpoints(): Promise<void> {
    const settings = await this.deps.appSettings.getAppSettings()
    for (const endpoint of settings.executionHostEndpoints) {
      this.prime(this.hostFor(endpoint.id))
    }
  }
}
