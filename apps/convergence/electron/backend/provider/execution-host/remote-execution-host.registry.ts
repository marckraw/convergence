import type { ExecutionSessionWorkspace } from '@mrck-labs/execution-host-protocol'
import type { AppSettingsService } from '../../app-settings/app-settings.service'
import type { ExecutionHostDaemonCredentialsService } from '../../credentials/execution-host-daemon-credentials.service'
import type { ProviderDebugSink } from '../../provider-debug/provider-debug-sink'
import { RemoteExecutionHost } from './remote-execution-host'
import {
  AppSettingsRemoteExecutionHostConnectionResolver,
  RemoteExecutionHostError,
} from '@convergence/execution-host-client'
import type { RemoteExecutionHostRegistry } from './remote-execution-host.types'

interface RemoteExecutionHostRegistryDeps {
  appSettings: Pick<
    AppSettingsService,
    | 'getAppSettings'
    | 'hasExecutionHostEndpoint'
    // Handed straight through to every resolver this registry builds: the
    // configuration epoch moves where a connection is minted (MAR-2689 round
    // 6), and the registry is what puts the two together.
    | 'observeExecutionHostConfiguration'
    // The epoch's other input, bound to each host the same way (MAR-2689 round
    // 8). A host knows what the machine advertised; only the registry knows
    // which Endpoint it speaks for, so the binding happens here.
    | 'observeExecutionHostCapabilities'
  >
  credentials: Pick<ExecutionHostDaemonCredentialsService, 'resolveToken'>
  fetch?: typeof fetch
  /** Forwarded to every host: the stream cursor each run persists. */
  onEventSeq?: (sessionId: string, seq: number) => void
  /**
   * Forwarded to every host: the workspace each daemon says it made.
   *
   * Required, unlike its neighbour above, because the type is the only thing
   * that can hold this wire in place. Deleting the composition root's line in
   * `main/index.ts`, or the forwarding below, left every suite green while the
   * app silently stopped recording start echoes -- a wire whose removal costs
   * nothing is not shipped (MAR-2694 round 2). A caller with nothing to do with
   * it says so out loud with a no-op; it cannot forget.
   */
  onWorkspaceReported: (
    sessionId: string,
    workspace: ExecutionSessionWorkspace,
  ) => void
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
      observeCapabilities: (capabilitiesFingerprint) =>
        this.deps.appSettings.observeExecutionHostCapabilities(
          endpointId,
          capabilitiesFingerprint,
        ),
      fetch: this.deps.fetch,
      onEventSeq: this.deps.onEventSeq,
      onWorkspaceReported: this.deps.onWorkspaceReported,
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
   * Re-reads one Endpoint's base URL and token, so a change to either is
   * *observed* (MAR-2689 round 6).
   *
   * The configuration epoch moves at a resolve and nowhere else, which is what
   * keeps it a fact about the machine rather than a second opinion about the
   * settings table. Most changes are observed by the wire call that follows
   * them; a token saved into the Keychain is the one that is not, because no
   * wire call has to happen for it and the renderer would go on showing --
   * and offering -- what the previous credential answered. This is the beat
   * that closes that, and it settles rather than being fired and forgotten so
   * a caller can broadcast the new Endpoint list after it.
   *
   * A refusal is an observation too, so it is swallowed: an Endpoint whose
   * token was just deleted resolves to nothing, and that is precisely the
   * change worth recording.
   */
  async observeEndpointConfiguration(endpointId: string): Promise<void> {
    try {
      await this.resolverFor(endpointId).resolveConnection()
    } catch {
      // Deliberately nothing: the resolve recorded what it found either way.
    }
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
