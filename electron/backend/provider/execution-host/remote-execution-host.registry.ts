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
 * its cache. Each new host primes that cache immediately: `start()` refuses a
 * provider it has never listed, so a host born cold would reject the first
 * turn on an Endpoint added after boot.
 *
 * Base URL and token are still read per call by the connection resolver, so
 * editing an Endpoint's address applies without rebuilding anything.
 */
export class AppSettingsRemoteExecutionHostRegistry implements RemoteExecutionHostRegistry {
  private readonly hosts = new Map<string, RemoteExecutionHost>()

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
    // Fire and forget: an Endpoint that is unreachable or unconfigured must
    // not stall the caller, and the failure surfaces at the turn or at the
    // settings connection test rather than here.
    void host.refreshProviders().catch(() => {})
    return host
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
   * Builds the host for every configured Endpoint, priming each one's provider
   * cache. Called at boot so the first remote turn does not race the listing.
   */
  async primeConfiguredEndpoints(): Promise<void> {
    const settings = await this.deps.appSettings.getAppSettings()
    for (const endpoint of settings.executionHostEndpoints) {
      this.hostFor(endpoint.id)
    }
  }
}
