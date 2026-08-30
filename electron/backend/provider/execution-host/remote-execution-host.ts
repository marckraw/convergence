import type { SessionDelta } from '../../session/conversation-item.types'
import { ProviderSessionEmitter } from '../provider-session.emitter'
import type {
  ActivitySignal,
  AttentionState,
  OneShotInput,
  OneShotResult,
  ProviderContextManagementInput,
  ProviderContextManagementResult,
  ProviderDescriptor,
  SessionContextWindow,
  SessionHandle,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import {
  decodeExecutionEventEnvelope,
  encodeExecutionCommandEnvelope,
  encodeExecutionStartRequest,
  EXECUTION_PROTOCOL_VERSION,
  type ExecutionHostCommand,
  type ExecutionHostEvent,
} from '@mrck-labs/execution-host-protocol'
import {
  buildWireApproveCommand,
  buildWireDenyCommand,
  buildWireSendMessageCommand,
  buildWireStartRequest,
  buildWireStopCommand,
  toLocalSessionDelta,
  withSettledAttention,
} from './execution-host-wire-mapping.pure'
import {
  evaluateHandshake,
  parseDaemonHealth,
} from './execution-host-handshake.pure'
import type {
  DaemonHealthInfo,
  EndpointHandshakeResult,
} from './execution-host-handshake.types'
import type {
  ExecutionHostProviderCapabilities,
  ProviderExecutionHost,
} from './execution-host.types'
import {
  blockedProviderError,
  daemonCapabilitiesFingerprint,
  daemonConfigurationFingerprint,
  describeRemoteExecutionHostFailure,
  capabilitiesForRemoteProvider,
  createSseParser,
  catalogEntryForRemoteProvider,
  describeRemoteProviderBlock,
  parseRemoteExecutionHostMeta,
  parseRemoteExecutionHostStartResponse,
  parseRemoteSessionWorkspaceInfo,
  type RemoteSessionWorkspaceInfo,
  remoteExecutionHostReconnectDelayMs,
  unavailableProviderError,
  UNRESOLVED_DAEMON_CONFIGURATION,
} from './remote-execution-host.pure'
import type { ProviderCatalog } from '../provider-catalog.types'
import {
  advertisesRemoteProjects,
  decodeRemoteProjects,
  remoteProjectCatalogFromOutcome,
  remoteProjectsCapability,
  type RemoteProjectsCapability,
} from './remote-project.pure'
import type {
  RemoteProjectCatalog,
  RemoteProjectsOutcome,
} from './remote-project.types'
import {
  RemoteExecutionHostError,
  type RemoteExecutionHostConnection,
  type RemoteExecutionHostConnectionResolver,
  type RemoteExecutionHostProviderInfo,
} from './remote-execution-host.types'
import { describeWireEventShape } from './execution-host-wire-trace.pure'
import {
  noopDebugSink,
  type ProviderDebugSink,
} from '../../provider-debug/provider-debug-sink'
import type {
  ProviderDebugChannel,
  ProviderDebugEntry,
} from '../../provider-debug/provider-debug.types'

type FetchFn = typeof fetch

/**
 * With the exponential backoff capped at 30s this tolerates roughly 2.5
 * minutes of gateway outage before the session is failed locally. The
 * remote run typically survives such blips, so giving up early turns a
 * recoverable disconnect into a dead session.
 */
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10

/**
 * Emergence's number, and its reasoning with it
 * (`packages/client-core/src/endpoint/endpoint-handshake.service.ts:11`):
 * `/health` runs provider-readiness probes and takes several seconds cold, so
 * a tight timeout misreports a healthy daemon as one that answered nothing.
 * The cap exists for the other failure: a proxy that swallows the route by
 * hanging rather than 404ing would otherwise take the whole refresh with it.
 */
const DEFAULT_HEALTH_PROBE_TIMEOUT_MS = 15_000

/**
 * How many listings readiness will make before it gives up (MAR-2620).
 *
 * Not a retry policy: a listing that fails throws on the first attempt, and a
 * host whose configuration is already listed returns without a round trip at
 * all. A further attempt happens only when the Endpoint was edited while its
 * daemon was being asked. The bound is here so a configuration changing faster
 * than any daemon can answer costs one refused turn rather than a loop nothing
 * ends.
 *
 * It bounds listings and not observations, and `ensureListed` takes one more
 * observation than it is allowed listings: an attempt is not an answer until
 * something has looked at it, so a bound that counted the looks would spend
 * the last listing and never examine it. Exported so the tests that stand on
 * the last permitted attempt take the bound from here instead of copying it.
 */
export const MAX_LISTING_ATTEMPTS = 5

export interface RemoteExecutionHostDeps {
  connection: RemoteExecutionHostConnectionResolver
  /**
   * Reports what the machine advertised in the handshake that just landed, so
   * this Endpoint's configuration epoch moves when it changes (MAR-2689 round
   * 8).
   *
   * A host knows *what* was advertised and nothing about which Endpoint it
   * speaks for, so the binding is the registry's -- the same shape as
   * `onEventSeq`. Optional because a host built without one still holds its own
   * per-attempt provenance and refuses on its own behalf; what is missing then
   * is only the carrier to the renderer, which a host with no Endpoint list
   * behind it has nobody to carry to. The wire is pinned end to end by `the
   * configuration epoch` suite, which builds its hosts through the registry.
   */
  observeCapabilities?: (capabilitiesFingerprint: string) => void
  fetch?: FetchFn
  reconnect?: {
    maxAttempts?: number
    delayMs?: (attempt: number) => number
    wait?: (ms: number) => Promise<void>
  }
  /** Overridable so tests can prove the cap without waiting 15 seconds. */
  healthProbeTimeoutMs?: number
  /**
   * Called after each processed event envelope with its sequence number.
   * Callers persist this to resume the stream after an app restart.
   */
  onEventSeq?: (sessionId: string, seq: number) => void
  /**
   * Receives a redacted description of every wire event, as the local provider
   * adapters do for their own transports. Tracing is unconditional, as it is in
   * those adapters: every entry is built at the call site whatever the sink is.
   * Defaulting to a no-op sink only drops what the real sink would then do with
   * it — ring retention, renderer broadcast, and JSONL persistence — so tests
   * and embedders that do not care skip the bookkeeping, not the construction.
   */
  debugSink?: ProviderDebugSink
}

/**
 * A fact this host derived from one daemon configuration, kept together with
 * the configuration it came from (MAR-2620).
 *
 * The pairing is the whole design. Three times now something derived from an
 * Endpoint has gone on being used after that Endpoint changed, and each time
 * the proposed fix was to remember to clear it. A value that carries its own
 * provenance cannot be forgotten about, because reading it means proving the
 * provenance still holds -- see `RemoteExecutionHost.inForce`.
 *
 * Every state of what it guards wears it, not only the settled one: the
 * listing that landed, the attempt still in flight, and the failure that
 * explains an absence. An untreated state is the whole bug back again -- a
 * caller that joins an attempt started for another machine is answered by that
 * machine just as surely as one that reads a cache nobody cleared, and the
 * machine it actually named is never asked.
 */
interface DerivedFromConfiguration<T> {
  configuration: string
  value: T
}

/**
 * The one beat both of this host's refreshes keep (MAR-2689, MAR-2620).
 *
 * A refresh is an attempt opened *before* the request and committed only if
 * nothing newer opened in the meantime, so a slow read cannot land on top of a
 * newer one's answer. The provider listing spelled that rule out by hand; the
 * Projects listing did not spell it out at all, and overlapping reads -- which
 * StrictMode's double-run and any Settings edit make routine -- let the older
 * answer win. One helper rather than a second hand-written counter, so the two
 * refreshes cannot drift again.
 *
 * The counters stay per fact and are deliberately not shared between them: a
 * Projects read opening an attempt must not cancel a provider refresh that is
 * already in flight, which is a different fact about the same machine. Order
 * is all this answers: whether one fact's answer is still *true* is asked
 * elsewhere, of the provenance the answer carries -- see `ProjectsProvenance`
 * (MAR-2689 round 7). Rounds 4 and 5 kept a void floor here, which was an
 * event standing in for that provenance, and it is gone.
 */
class RefreshGeneration {
  private current = 0

  /** Opens an attempt. Only the newest one may commit. */
  begin(): number {
    return ++this.current
  }

  /** Runs `commit` while -- and only while -- this attempt is still newest. */
  ifCurrent(attempt: number, commit: () => void): void {
    if (attempt !== this.current) return
    commit()
  }
}

/**
 * A Projects outcome and the attempt that produced it (MAR-2689).
 *
 * The attempt number rides *with* the value rather than living in the
 * generation guard, because the question an overtaken read has to ask is not
 * "has anything landed since?" but "is what landed newer than me?". A counter
 * beside the cache answers the first; only the number stored with the value
 * answers the second, and the two differ at exactly the case that kept coming
 * back -- an overtaken failure while the newer attempt is still on the wire.
 */
interface LandedProjectsOutcome {
  attempt: number
  outcome: RemoteProjectsOutcome
}

/**
 * What a Projects answer was read under: the machine, and what that machine
 * said it could do (MAR-2689 round 7).
 *
 * The Projects outcome has always had two dependencies -- identity and
 * capability -- and until this existed it carried one. The Endpoint
 * configuration answers identity. It cannot answer capability: a machine that
 * changes its mind about `projects.v1` does so at the same base URL with the
 * same token, so its fingerprint never moves and no epoch is bumped, and an
 * answer read under the advertisement it has withdrawn was in force by every
 * test identity alone can run. Rounds 4 and 5 caught that with a pair of
 * events -- a cache clear and a void floor fired from the listing commit --
 * and an event only catches what is in flight while it fires. Provenance
 * catches it at every read, of the attempt and of the cache alike, which is
 * why one yardstick can now measure both.
 *
 * The capability rides as its epoch rather than as the tri-state itself, for
 * the same reason the configuration rides as one: equality of *values* cannot
 * tell "it never changed" from "it changed and came back". A machine that
 * withdraws `projects.v1` and offers it again has not been asked since the
 * listing on record was read, and a value comparison would put that listing
 * back in force -- pinned by `never refuses a Project in the name of a listing
 * read before the machine changed its mind`
 * (`remote-execution-host.work-address.test.ts`). The tri-state is what the
 * epoch is computed from, `unknown` included: a machine whose `/health` has
 * stopped being readable has become unknown about its Projects, which
 * supersedes both answers it could have given before.
 */
interface ProjectsProvenance {
  configuration: string
  capabilityEpoch: number
}

/**
 * What a Projects read whose handshake was replaced under it knows: nothing
 * (MAR-2689 round 4).
 *
 * Neither of the two answers it could otherwise give is available to it. Its
 * listing describes a machine that has since said it does no Projects, and
 * "this machine has none" would be that same replaced handshake talking. A
 * failure is the one outcome of the three that claims nothing and lets nothing
 * be refused in its name, and the sentence says what actually happened rather
 * than blaming the daemon for it.
 */
const PROJECTS_READ_UNDER_A_REPLACED_HANDSHAKE: RemoteProjectsOutcome = {
  kind: 'failed',
  reason:
    'it changed what it offers while its Projects were being read, so the ' +
    'answer that came back is no longer known to be true of it.',
}

/**
 * What a Projects read whose configuration was superseded under it knows:
 * nothing either (MAR-2689 round 6).
 *
 * The sibling of the sentence above, and the one that closes a token
 * rotation. An attempt dials the machine its Endpoint pointed at when it
 * opened; by the time the answer arrives that Endpoint may point somewhere
 * else, or hold a credential the old answer was never read under. What came
 * back is a true statement about a machine nobody is asking about, so it is
 * neither committed nor handed over -- and saying so is not blaming the
 * daemon, which answered perfectly well.
 */
const PROJECTS_READ_UNDER_A_SUPERSEDED_CONFIGURATION: RemoteProjectsOutcome = {
  kind: 'failed',
  reason:
    'its configuration changed while its Projects were being read, so the ' +
    'answer that came back is not about the machine this endpoint points at ' +
    'now. Asking again reads the machine in force.',
}

/** A provider listing and the handshake read in the same round trip. */
interface LandedListing {
  providers: RemoteExecutionHostProviderInfo[]
  handshake: EndpointHandshakeResult | null
}

/**
 * Remote Execution Host: runs Providers on an agents-daemon behind the
 * execution host wire protocol. Sessions start with a POST, stream events
 * over SSE (resumed by sequence number on drops), and accept commands as
 * posted envelopes.
 *
 * Provider capability data comes from the daemon's /v0/meta listing and is
 * cached so the synchronous capabilities()/start() interface holds. The cache
 * is stored with the daemon configuration it was read from and can only be
 * read back through `inForce`, which hands it over while -- and only while --
 * that configuration is still the one the resolver returns. So editing an
 * Endpoint's base URL or token needs nothing cleared and nobody notified: the
 * old listing stops being an answer the moment the new configuration is
 * observed, and every wire call observes it. `ensureListed()` is what observes
 * it before a turn, and lists the new machine when it differs. The cost of a
 * URL change is therefore one round trip on the next turn, not a rebuilt host
 * -- sessions already holding handles from this one keep running.
 *
 * The listing still in flight is stored the same way, and readiness proves the
 * pairing again when it lands: a caller asking about the machine this Endpoint
 * names now never waits on a round trip aimed somewhere else, and never treats
 * one that finished about somewhere else as an answer.
 */
export class RemoteExecutionHost implements ProviderExecutionHost {
  private readonly fetchFn: FetchFn
  private readonly maxReconnectAttempts: number
  private readonly reconnectDelayMs: (attempt: number) => number
  private readonly wait: (ms: number) => Promise<void>
  private readonly healthProbeTimeoutMs: number
  private readonly debugSink: ProviderDebugSink
  /**
   * The daemon configuration the resolver last returned, and the yardstick
   * every cached answer is measured against. Written by `resolveConnection`,
   * which every wire call and every listing already goes through, so nothing
   * has to be told that settings changed -- observing the new configuration is
   * what invalidates.
   */
  private configuration: string = UNRESOLVED_DAEMON_CONFIGURATION
  /**
   * The last listing that landed and the handshake that came with it, one
   * value because they are one fact about one daemon. Never read directly:
   * `inForce` is the only way in.
   */
  private listing: DerivedFromConfiguration<LandedListing> | null = null
  /**
   * Why the most recent listing failed, kept so a refusal can name the real
   * reason instead of the absence it produced. It does not displace a listing
   * that landed -- a blip must not erase what the daemon last said -- and it
   * ages out the same way, so neither a daemon that came back nor an Endpoint
   * that moved keeps answering with the outage that preceded it.
   */
  private listingFailure: DerivedFromConfiguration<Error> | null = null
  /**
   * The listing in flight and the daemon configuration it was started for, so
   * callers arriving together share one round trip -- and only when they are
   * asking about the same machine. Read through `inForce` like every other
   * derived value here: an attempt against the address this Endpoint has just
   * been edited away from is not one anybody can wait on, and joining it would
   * report ready for a daemon that was never asked anything.
   *
   * It resolves to why the attempt failed rather than rejecting: most callers
   * only start it, and a rejected promise nobody awaits is an unhandled
   * rejection.
   */
  private pendingListing: DerivedFromConfiguration<
    Promise<Error | null>
  > | null = null
  /**
   * What this daemon last said about its Projects, the attempt that heard it,
   * and the configuration it was heard from (MAR-2689).
   *
   * Kept the same way as the provider listing and read the same way -- through
   * `inForce` -- because it is the same kind of fact: a list of directories is
   * only true of the machine it was read from, and an Endpoint repointed in
   * Settings keeps its id. Null means nothing has been read for the machine in
   * force, which is not the same claim as a machine that listed none; `start`
   * depends on that difference to know when it may refuse.
   *
   * It is derived from the handshake as well as from the configuration, so it
   * carries both -- see `ProjectsProvenance`, and `projectsInForce`, which is
   * the only way in. It can still lag the handshake by one beat, which is why
   * `assertWorkPlaceRunnable` asks the handshake before it asks this: a cache
   * is never the authority on whether the machine does Projects at all.
   *
   * One field for all three outcomes, and the attempt number stored beside
   * them. Two fields -- a listing and a failure -- meant every reader had to
   * decide which of them spoke, and each round of review found one more reader
   * deciding it wrongly. With one value the only question left is *whose*
   * answer this is, and that is a comparison of two integers: an outcome that
   * landed from an attempt at least as new as mine is the one on record, of
   * whatever kind, and nothing else can outrank my own.
   */
  private projectsOutcome: {
    provenance: ProjectsProvenance
    value: LandedProjectsOutcome
  } | null = null
  /**
   * How many times this machine has changed what it says about its Projects
   * (MAR-2689 round 7).
   *
   * The capability half of `ProjectsProvenance`, kept as a count rather than
   * as the answer itself so that a machine returning to a capability it once
   * had does not put an answer read before the round trip back in force.
   * Observed where the fact changes -- the listing commit, which is where a
   * handshake lands -- for the same reason the configuration epoch is observed
   * where a connection is resolved: a change between two reads is invisible to
   * anything that only looks at read time.
   */
  private projectsCapabilityEpoch = 0
  /**
   * The capability the last observation saw, so the epoch counts changes and
   * not observations. `unknown` is the honest starting value: a host that has
   * never listed has no handshake, and that is exactly what
   * `remoteProjectsCapability(null)` says.
   */
  private observedProjectsCapability: RemoteProjectsCapability = 'unknown'
  /**
   * Bumped by every provider refresh so a slow one that finishes last cannot
   * overwrite a newer one's answer. Same reason Emergence's handshake service
   * keeps one per endpoint (`endpoint-handshake.service.ts:36-40`).
   *
   * It guards `listing` and `listingFailure` together, because they are two
   * states of one fact and exactly one refresh writes either.
   */
  private readonly listingRefresh = new RefreshGeneration()
  /** The same guard for the Projects outcome, which is its own fact. */
  private readonly projectsRefresh = new RefreshGeneration()

  constructor(private readonly deps: RemoteExecutionHostDeps) {
    this.fetchFn = deps.fetch ?? fetch
    this.healthProbeTimeoutMs =
      deps.healthProbeTimeoutMs ?? DEFAULT_HEALTH_PROBE_TIMEOUT_MS
    this.maxReconnectAttempts =
      deps.reconnect?.maxAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS
    this.reconnectDelayMs =
      deps.reconnect?.delayMs ?? remoteExecutionHostReconnectDelayMs
    this.wait =
      deps.reconnect?.wait ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.debugSink = deps.debugSink ?? noopDebugSink
  }

  /**
   * Fetches the daemon provider listing and replaces the capability cache,
   * shaking hands with the daemon over `/health` on the way. Throws
   * RemoteExecutionHostError; on failure the previous cache stays in place.
   *
   * Returns the cache as it stands after the commit, not this call's own read:
   * a refresh overtaken by a newer one reports the newer daemon, so a caller
   * that reads handshake() next is never handed a mismatched pair. A refresh
   * whose configuration was superseded while it was in flight reports nothing,
   * for the same reason -- what it read is not about the machine in force.
   */
  async refreshProviders(): Promise<RemoteExecutionHostProviderInfo[]> {
    // The configuration this attempt is against, captured before the attempt
    // is opened so even a failure knows which machine it is a failure of --
    // and so the attempt's number and its machine are the same fact
    // (`openAttempt`).
    const { attempt, configuration, connection, failure } =
      await this.openAttempt(this.listingRefresh)
    try {
      if (!connection) throw failure
      // Started before the listing rather than after it: /health is
      // unauthenticated and independent, so it runs concurrently and usually
      // adds no wall-clock at all. When health is the slower half the refresh
      // costs max(meta, health), which is why the probe is capped: the added
      // latency is bounded, not zero. It never rejects, so a meta failure
      // below leaves nothing dangling.
      const healthProbe = this.probeHealth(connection)
      const meta = await this.requestJson(connection, '/v0/meta', {
        method: 'GET',
      })
      const providers = parseRemoteExecutionHostMeta(meta)
      const health = await healthProbe
      // The authenticated half of the handshake is the listing that just
      // succeeded, so 'ok' is a statement of fact at this line and nowhere
      // earlier.
      const handshake = health
        ? evaluateHandshake(health, null, { kind: 'ok' })
        : null
      // Both values land in one synchronous step, and only if no newer refresh
      // has started. Settings changes make two refreshes overlap routinely; a
      // write on either side of an await pairs one daemon's providers with
      // another daemon's name.
      this.listingRefresh.ifCurrent(attempt, () => {
        this.listing = { configuration, value: { providers, handshake } }
        this.listingFailure = null
        // The one place a handshake lands, so the one place the capability it
        // carries can be seen to change. Anything derived from the previous
        // answer goes out of force here, without being told to.
        this.observeProjectsCapability(handshake)
        // The same change, told to the one thing that can carry it across the
        // wire: this Endpoint's epoch, which the renderer already keys both its
        // catalogs by (MAR-2689 round 8). Two observations rather than one
        // because they are two facts -- this host's provenance is about
        // Projects, and the epoch is about everything derived from the machine
        // -- and the ledger, not this line, decides whether either moved.
        this.deps.observeCapabilities?.(
          daemonCapabilitiesFingerprint(handshake),
        )
      })
      return this.listedProviders()
    } catch (error) {
      // Same generation guard as the success path, for the same reason: an
      // overtaken refresh must not report its failure over a newer one's
      // answer.
      this.listingRefresh.ifCurrent(attempt, () => {
        this.listingFailure = {
          configuration,
          value: error instanceof Error ? error : new Error(String(error)),
        }
      })
      throw error
    }
  }

  /**
   * Notices that this machine has changed what it says about its Projects
   * (MAR-2689 round 7).
   *
   * The whole of the capability half of `ProjectsProvenance`: the epoch it
   * carries moves here and nowhere else, and every answer measured against it
   * -- an attempt still on the wire, an outcome on record -- goes out of force
   * the moment it moves. Nothing is cleared and nothing is cancelled; the
   * answers simply stop being obtainable, which is the same discipline the
   * configuration half already keeps.
   *
   * It reads the handshake that just landed rather than `handshake()`, because
   * this is the landing: the fact to compare is the one being committed, not
   * whatever a reader could get at afterwards.
   *
   * The comparison is the tri-state, not the boolean. A machine whose
   * `/health` has stopped being readable has become *unknown* about its
   * Projects, which supersedes both of the answers it could have given before;
   * reading that as "still not advertising" left an `unsupported` on record
   * that nobody could ask again (MAR-2689 round 5).
   *
   * A listing that says what the last one said moves nothing, which is what
   * keeps the ordinary case ordinary: a composer asks one machine for its
   * providers and its Projects in the same beat, so a refresh landing while
   * `/v0/projects` is on the wire is routine, and moving the epoch there would
   * turn a machine that answered perfectly well into one whose Projects "could
   * not be read" -- an outage invented out of a refresh (MAR-2689 round 4).
   */
  private observeProjectsCapability(
    handshake: EndpointHandshakeResult | null,
  ): void {
    const capability = remoteProjectsCapability(handshake)
    if (capability === this.observedProjectsCapability) return
    this.observedProjectsCapability = capability
    this.projectsCapabilityEpoch += 1
  }

  /**
   * Ensures this host's provider listing was read from the daemon
   * configuration now in force, listing the new one when it was not, and
   * throwing with why when no listing can be had (MAR-2620).
   *
   * What anything about to start a session awaits. `start()` reads the
   * capability cache synchronously, and there are two ways that cache can be
   * wrong: it has not arrived yet, and it arrived from an address this
   * Endpoint no longer points at. Both are settled here, before that read. Not
   * a retry and not a sleep -- at most one round trip, shared by everyone who
   * asks while it is running.
   *
   * Each round observes before it decides, and a listing only ends the loop
   * once it has been observed to be about the machine in force. A listing
   * costs a round trip and an Endpoint can be edited during one, so an attempt
   * that was correctly scoped when it started can still land about a machine
   * that has since been left -- and `this.configuration` is itself only as
   * fresh as the last resolve, so re-reading the field after that await would
   * measure a stale answer against a stale yardstick and call it a match. The
   * observation is what makes the second look worth taking. A listing about a
   * machine no longer in force is discarded, and the machine now in force is
   * listed instead.
   *
   * The loop's invariant, and what makes the refusal below true: every attempt
   * is evaluated, the last one included. Evaluating an attempt is the check at
   * the top of the *following* pass, so the loop takes one more pass than it is
   * allowed listings and spends the extra one observing and nothing else. Reach
   * the throw and all `MAX_LISTING_ATTEMPTS` listings have been looked at and
   * each was about a machine this Endpoint had already left -- the
   * configuration genuinely kept moving, which is the only thing the sentence
   * claims. It is never reached by a good listing nobody examined.
   */
  async ensureListed(): Promise<void> {
    for (let listings = 0; ; listings += 1) {
      await this.observeConfiguration()
      if (this.inForce(this.listing)) return
      if (listings === MAX_LISTING_ATTEMPTS) break
      const failure = await this.listOnce()
      if (failure) throw failure
    }
    throw new RemoteExecutionHostError(
      'The execution host endpoint kept changing while its providers were ' +
        'being listed, so nothing could be read from the address it points ' +
        'at now.',
      'configuration',
    )
  }

  /**
   * Reads which daemon configuration is in force, which is the only way this
   * host ever learns that, and the yardstick every derived value is then
   * measured against.
   *
   * A failure is not swallowed: it sets the configuration to the unresolved
   * one, which no landed listing and no attempt in flight can match, so the
   * refresh that follows runs and throws the same error with the
   * classification a refusal needs.
   */
  private async observeConfiguration(): Promise<void> {
    try {
      await this.resolveConnection()
    } catch {
      // Deliberately nothing: the refresh that follows reports it.
    }
  }

  /**
   * One listing attempt for the configuration in force, joined rather than
   * duplicated by callers that arrive together.
   *
   * The attempt is keyed by the machine it is against, so a caller asking
   * about B does not join one started for A -- it starts its own, and B's
   * daemon is the one that gets asked. Callers asking about the same machine
   * still share the one round trip: scoping the memo is not the same as having
   * no memo, and re-listing on every ask would put a round trip and an empty
   * cache on every turn.
   *
   * Synchronous from the caller's observation to the memo write, deliberately:
   * an await in between would let the configuration move after it was read and
   * key the attempt to a machine nobody asked about. `ensureListed` observes,
   * then calls this.
   *
   * The attempt is forgotten once it settles, so the next caller re-observes:
   * that re-read is the invalidation, and a memo that outlived it would be one
   * more thing derived from an Endpoint that stopped tracking it. Never
   * rejects; see `pendingListing`.
   */
  private listOnce(): Promise<Error | null> {
    const joined = this.inForce(this.pendingListing)
    if (joined) return joined

    const configuration = this.configuration
    const attempt: Promise<Error | null> = this.list().then((failure) => {
      if (this.pendingListing?.value === attempt) this.pendingListing = null
      return failure
    })
    this.pendingListing = { configuration, value: attempt }
    return attempt
  }

  /** One refresh, reporting why it failed rather than throwing it. */
  private async list(): Promise<Error | null> {
    try {
      await this.refreshProviders()
      return null
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error))
    }
  }

  /**
   * A fact this host learned, handed back only while the configuration it was
   * learned from is still the one in force (MAR-2620).
   *
   * The single read of every cached value, and the line that makes a stale
   * pairing unrepresentable rather than merely tidied up afterwards. Nothing
   * has to notice that an Endpoint's address changed; an answer derived from
   * the old one simply cannot be obtained here.
   */
  private inForce<T>(known: DerivedFromConfiguration<T> | null): T | null {
    return known && this.configurationInForce(known.configuration)
      ? known.value
      : null
  }

  /**
   * Whether something read under this daemon configuration is still about the
   * machine in force (MAR-2689 round 6).
   *
   * The comparison `inForce` is built on, named on its own because an attempt
   * carries its configuration without carrying a value yet: it is opened
   * against a machine and has to be measured against the same yardstick as
   * everything already learned from one. Written out a second time it would be
   * the same rule in two places, which in this file is a rule that drifts.
   */
  private configurationInForce(configuration: string): boolean {
    return configuration === this.configuration
  }

  /**
   * The two facts a Projects answer is read under, taken together (MAR-2689
   * round 7).
   *
   * One place the pair is built, so a caller cannot come to take one of them
   * from one beat and the other from another -- which is the shape of every
   * defect this seam has produced.
   */
  private projectsProvenance(configuration: string): ProjectsProvenance {
    return { configuration, capabilityEpoch: this.projectsCapabilityEpoch }
  }

  /**
   * Whether a Projects answer read under this provenance is still an answer
   * (MAR-2689 round 7).
   *
   * The one yardstick, used by the attempt that is about to commit and by the
   * outcome already on record -- `landedProjectsOutcome` is `inForce` for a
   * value with two facts in its provenance instead of one. Two readings of one
   * rule is how this seam drifted six times; there is one reading now.
   */
  private projectsInForce(provenance: ProjectsProvenance): boolean {
    return (
      this.configurationInForce(provenance.configuration) &&
      provenance.capabilityEpoch === this.projectsCapabilityEpoch
    )
  }

  /**
   * What this machine last said about its Projects, handed back only while
   * both facts it was read under still hold (MAR-2689 round 7).
   */
  private landedProjectsOutcome(): LandedProjectsOutcome | null {
    const known = this.projectsOutcome
    return known && this.projectsInForce(known.provenance) ? known.value : null
  }

  /**
   * Opens one refresh attempt against the configuration it is an attempt on
   * (MAR-2689 round 6).
   *
   * The resolve comes first and the attempt number second, in one synchronous
   * beat, so an attempt's number and its configuration are one fact rather
   * than two that can disagree: a number that outranks another's must not be
   * able to carry an older machine's address or credential, which is how a
   * read opened under one token came to speak for the machine behind the next
   * one. Nothing awaits between the fingerprint and the `begin()`.
   *
   * A resolve that fails is carried rather than thrown, because the attempt
   * still has to exist: a failure is an answer about a machine too, and one
   * that never opened an attempt could not be ordered against the reads it
   * overtook. Its configuration is the unresolved one, which is exactly what
   * `resolveConnection` has just made current, so it commits normally.
   */
  private async openAttempt(refresh: RefreshGeneration): Promise<{
    attempt: number
    configuration: string
    connection: RemoteExecutionHostConnection | null
    failure: unknown
  }> {
    let connection: RemoteExecutionHostConnection | null = null
    let failure: unknown = null
    try {
      connection = await this.resolveConnection()
    } catch (error) {
      failure = error
    }
    const configuration = daemonConfigurationFingerprint(connection)
    return { attempt: refresh.begin(), configuration, connection, failure }
  }

  /**
   * The providers of the configuration in force -- none while none is known,
   * which is not the same claim as a daemon that listed none. See
   * `assertProviderRunnable` for the difference and who needs it.
   */
  private listedProviders(): RemoteExecutionHostProviderInfo[] {
    return this.inForce(this.listing)?.providers ?? []
  }

  /**
   * What the daemon said about itself at the last successful refresh, or null
   * when it said nothing readable. Null is the honest answer for a daemon too
   * old to serve `/health`, and callers must treat it as "unknown", never as
   * "unsupported".
   */
  handshake(): EndpointHandshakeResult | null {
    return this.inForce(this.listing)?.handshake ?? null
  }

  /**
   * Reads `GET /health` without the Authorization header: the route is
   * unauthenticated, and a token has no business riding a request that does
   * not need one. Never throws, and never outlasts its timeout — a daemon that
   * predates the route, a proxy that swallows it with a 404, and a proxy that
   * swallows it by hanging must all still be able to list their providers.
   */
  private async probeHealth(
    connection: RemoteExecutionHostConnection,
  ): Promise<DaemonHealthInfo | null> {
    try {
      const response = await this.fetchFn(
        buildRemoteUrl(connection.baseUrl, '/health'),
        {
          method: 'GET',
          signal: AbortSignal.timeout(this.healthProbeTimeoutMs),
        },
      )
      if (!response.ok) return null
      return parseDaemonHealth(JSON.parse(await response.text()))
    } catch {
      return null
    }
  }

  capabilities(): ExecutionHostProviderCapabilities[] {
    return this.listedProviders().map(capabilitiesForRemoteProvider)
  }

  /** One lookup for the listing, so a caller cannot invent a second reading. */
  private listedProvider(
    providerId: string,
  ): RemoteExecutionHostProviderInfo | null {
    return (
      this.listedProviders().find((p) => p.providerId === providerId) ?? null
    )
  }

  capabilitiesFor(
    providerId: string,
  ): ExecutionHostProviderCapabilities | null {
    const info = this.listedProvider(providerId)
    return info ? capabilitiesForRemoteProvider(info) : null
  }

  /**
   * Refuses a provider this host will not run, saying which of the three
   * things is wrong (MAR-2620, MAR-2682).
   *
   * Every entry point that needs a provider asks here rather than reading the
   * cache itself. Three sites each writing `if (!capabilitiesFor(id)) throw`
   * is three places to relearn that an empty cache is not an answer -- and
   * `start()` had already learned it wrong, telling a reader "Provider not
   * found: claude-code" about a daemon that had simply not been asked yet.
   *
   * Listed is not the same as runnable, which is the third thing. The daemon
   * reports `available` and `authenticated` per provider, and until MAR-2682
   * this asked only whether the id appeared at all -- so a CLI the daemon had
   * already said it cannot run started anyway and failed on the far side. The
   * option row does keep such a row out of its selectable list, and that is
   * the right place for *picking*; it is not a boundary. A resumed session, a
   * relay, or any surface that never rendered the row reaches this method
   * directly.
   *
   * Public, and on the interface, because the callers who most need it are not
   * in this file: `SessionService` gated turns on `capabilitiesFor` returning
   * something, which is a descriptive method answering a permission question --
   * so a provider this daemon lists and refuses came back to the human as
   * "Provider not found" instead of the daemon's own sentence (MAR-2682).
   */
  assertProviderRunnable(providerId: string): void {
    const info = this.listedProvider(providerId)
    if (!info) {
      throw unavailableProviderError({
        providerId,
        listed: this.inForce(this.listing) !== null,
        listingFailure: this.inForce(this.listingFailure),
      })
    }

    // The daemon's own verdict and the daemon's own words -- the same sentence
    // the disabled row upstairs shows, from the same derivation, so a refusal
    // can never explain itself differently from the control that predicted it.
    const blockedReason = describeRemoteProviderBlock(info)
    if (blockedReason) throw blockedProviderError(providerId, blockedReason)
  }

  /**
   * This daemon's catalog: what it offers, what it will refuse and why, and
   * whether it could be asked at all (MAR-2682).
   *
   * The option row reads this. A failure is reported rather than thrown
   * because the row has to render either way, and the three outcomes look
   * different to a reader: a machine that answered, a machine that answered
   * about a provider it will not run, and a machine that never answered. The
   * last one keeps the previous listing when there is one -- a blip must not
   * empty a row that was correct a second ago -- but says so, so an empty row
   * is never mistaken for a daemon with nothing on it.
   */
  async describeCatalog(): Promise<Omit<ProviderCatalog, 'executionHostId'>> {
    let unreachableReason: string | null = null
    try {
      await this.refreshProviders()
    } catch (error) {
      unreachableReason = describeRemoteExecutionHostFailure(error)
    }
    return {
      providers: this.listedProviders().map(catalogEntryForRemoteProvider),
      unreachableReason,
    }
  }

  /**
   * This daemon's Projects: the places a session can be given to work in that
   * already exist on that machine (MAR-2689).
   *
   * The strip's second slot reads this. Reported rather than thrown for the
   * same reason `describeCatalog` is: the slot has to render either way, and
   * the three outcomes look different to a reader — a machine that offers
   * Projects, a machine that does not do Projects at all, and a machine that
   * could not be asked.
   *
   * `/v0/projects` is read only where the machine advertises `projects.v1`,
   * and the advertisement arrives with the provider listing, so this ensures
   * that listing first. A listing failure is reported and the read is not
   * attempted: without a handshake there is no advertisement, and asking a
   * machine we have not heard from would be guessing at its protocol.
   *
   * The whole invocation is one attempt, opened on the first line. Every path
   * out of it — a listing, a machine that does not do Projects, an unreadable
   * body, a failed request — computes an outcome and falls through to the one
   * `commitProjectsOutcome` below, which is the method's only `return`. Three
   * rounds of review found three exits that had slipped outside the beat, each
   * one an answer that could land on top of a newer one; a shape with a single
   * exit is what makes a fourth impossible rather than merely absent.
   *
   * The outcome is cached with the configuration it was read from, so `start`
   * can refuse a Project this machine no longer offers without a round trip
   * and without ever measuring one daemon's answer against another's address
   * (MAR-2620, "every derived value carries the configuration it was derived
   * from").
   */
  async describeProjectCatalog(): Promise<
    Omit<RemoteProjectCatalog, 'executionHostId'>
  > {
    // Opened against the machine it is an attempt on, before anything else --
    // including the provider listing this needs. Two things ride on that
    // order. An attempt that starts later than it claims cannot supersede the
    // reads it overtook, which is how a machine that had stopped advertising
    // Projects still had an older listing land on top of it (round 3); and an
    // attempt whose configuration is learned later than its number can outrank
    // a newer read while speaking for an older machine (round 6).
    const { attempt, configuration, connection, failure } =
      await this.openAttempt(this.projectsRefresh)
    // The identity half is known here; the capability half is not, and cannot
    // be. Before `ensureListed` this host may have no handshake at all -- on a
    // machine's first read it never does, and on an Endpoint just repointed
    // the only handshake it has belongs to the machine it was moved away
    // from. Captured here it would be `unknown` on exactly the reads that go
    // on to succeed, and every one of them would be refused its own answer.
    // So the pair is completed at the beat the capability is read, which is
    // also the beat that authorises the request (MAR-2689 round 7).
    let provenance = this.projectsProvenance(configuration)
    let outcome: RemoteProjectsOutcome
    try {
      if (!connection) throw failure
      await this.ensureListed()
      provenance = this.projectsProvenance(configuration)
      if (!advertisesRemoteProjects(this.handshake())) {
        outcome = { kind: 'unsupported' }
      } else {
        // The connection this attempt opened against, not one resolved again
        // here: the machine an attempt dials must be the machine it is
        // measured against, or the two can be different daemons and neither
        // the answer nor the refusal is about the one that was asked.
        const body = await this.requestJson(connection, '/v0/projects', {
          method: 'GET',
        })
        const decoded = decodeRemoteProjects(body)
        outcome =
          decoded.status === 'malformed'
            ? // Asked, and answered with something that is not a listing. That
              // is not "this machine has none": the strip must say the Projects
              // could not be read, or it states an absence the daemon never
              // claimed.
              { kind: 'failed', reason: decoded.reason }
            : { kind: 'listed', projects: decoded.projects }
      }
    } catch (error) {
      outcome = {
        kind: 'failed',
        reason: describeRemoteExecutionHostFailure(error),
      }
    }
    return this.commitProjectsOutcome(attempt, provenance, outcome)
  }

  /**
   * Puts one attempt's outcome on record and answers with whichever outcome is
   * the newest to have landed (MAR-2689).
   *
   * The commit and the return are one decision, and both are decided by
   * attempt number. `ifCurrent` keeps an overtaken answer out of the cache; the
   * comparison below keeps it out of the caller's hands too, which is the half
   * that kept being missed. The renderer commits by *source* rather than by
   * request order, so an overtaken read returning its own answer lands last and
   * the strip offers a Project the cache no longer holds -- which `start` then
   * refuses, naming the place the strip has just shown.
   *
   * Two integers rather than a precedence between fields, because precedence
   * cannot tell the two overtaken cases apart: "something newer landed and it
   * simply has no failure to report" and "nothing newer has answered yet" look
   * identical to any rule that reads a cached failure first. An outcome that
   * landed from an attempt at least as new as this one is the state of the
   * machine and is handed back whatever kind it is, `unsupported` included;
   * otherwise this attempt is still the freshest thing known and speaks for
   * itself, and staying silent would state an absence the daemon never claimed.
   *
   * Unless what it read under is gone rather than merely older -- the two cases
   * where an attempt with nothing newer behind it must still not speak. Its
   * configuration may have been superseded, so it is describing a machine this
   * Endpoint no longer points at (round 6); or the capability that authorised
   * the read may have been withdrawn, so the machine has changed its mind
   * about having Projects at all (round 7). Both are the provenance it
   * carries, asked once; neither is a fresher answer to the question asked, so
   * neither is committed and neither is handed back -- the caller gets a
   * failure that says which, and nothing is ever reported as gone.
   */
  private commitProjectsOutcome(
    attempt: number,
    provenance: ProjectsProvenance,
    outcome: RemoteProjectsOutcome,
  ): Omit<RemoteProjectCatalog, 'executionHostId'> {
    // Two conditions on the commit, not one: newest, and still true. Being
    // newest is a fact about order and says nothing about whether the machine
    // still answers this question the way it did -- a capability withdrawn
    // under an attempt with nothing behind it leaves it both newest and wrong.
    // The invariant belongs to this line: "what is on record was read under
    // the machine in force, saying what it says now" should be readable from
    // the write.
    this.projectsRefresh.ifCurrent(attempt, () => {
      if (!this.projectsInForce(provenance)) return
      this.projectsOutcome = { provenance, value: { attempt, outcome } }
    })
    const landed = this.landedProjectsOutcome()
    if (landed && landed.attempt >= attempt) {
      return remoteProjectCatalogFromOutcome(landed.outcome)
    }
    const superseded = !this.configurationInForce(provenance.configuration)
      ? PROJECTS_READ_UNDER_A_SUPERSEDED_CONFIGURATION
      : !this.projectsInForce(provenance)
        ? PROJECTS_READ_UNDER_A_REPLACED_HANDSHAKE
        : null
    return remoteProjectCatalogFromOutcome(superseded ?? outcome)
  }

  /**
   * Refuses a Project this machine does not offer, by name (MAR-2689).
   *
   * The same shape as the missing-Endpoint refusal a session gets when the
   * machine it named is gone: a synchronous read of what is on record, refusing
   * before anything is spawned, and never falling back to some other place. A
   * remote start that names a working directory and no workspace is Project
   * mode — the daemon resolves that directory as one of its Projects — so a
   * directory this machine has stopped offering would otherwise be sent,
   * refused at the wire, and reported as a workspace error with no hint that
   * the *place* is what went stale.
   *
   * Two questions in order, and the order is the ruling of round 5: **the
   * current handshake first, the cached listing second.** The cache is derived
   * from a handshake and can only ever lag it, so at the last synchronous beat
   * before a session is spawned the authoritative fact about whether this
   * machine does Projects at all is what the machine is saying now. Five rounds
   * of review each found one more way a cache could outlive its source; this
   * asks the source.
   *
   * 1. The handshake is unknown — no readable `/health` — and nothing may be
   *    refused. "Unknown" is never reported as "gone": the daemon stays the
   *    final authority, exactly as it is for a provider that was never listed.
   * 2. It answered and withheld `projects.v1`. Project mode is not a thing this
   *    daemon has, whatever is on record and whether or not anything was ever
   *    read — the strip offers Repository instead, and a directory sent as a
   *    Project would be refused at the wire with no hint that the *place* is
   *    what is wrong.
   * 3. It advertises them, so the listing decides — the same outcome the strip
   *    is drawn from, so the slot and this refusal can never disagree about
   *    which places exist. Only a listing that does not hold this directory
   *    refuses. A failure answers nothing, an empty cache answers nothing, one
   *    read from an address the Endpoint has since left is not handed over at
   *    all, and neither is one read under a capability this machine has since
   *    withdrawn or regained — none of them may refuse.
   */
  private assertWorkPlaceRunnable(config: SessionStartConfig): void {
    if (config.workspace) return
    const capability = remoteProjectsCapability(this.handshake())
    if (capability === 'unknown') return
    if (capability === 'withheld') {
      throw this.unrunnableWorkPlaceError(
        config.workingDirectory,
        'execution host lists no Projects to hold. ',
      )
    }
    const outcome = this.landedProjectsOutcome()?.outcome
    if (!outcome || outcome.kind !== 'listed') return
    if (
      outcome.projects.some(
        (project) => project.workingDirectory === config.workingDirectory,
      )
    ) {
      return
    }
    throw this.unrunnableWorkPlaceError(
      config.workingDirectory,
      'execution host no longer lists as a Project. ',
    )
  }

  /** One sentence for both refusals, so they cannot drift into two shapes. */
  private unrunnableWorkPlaceError(
    workingDirectory: string,
    middle: string,
  ): RemoteExecutionHostError {
    return new RemoteExecutionHostError(
      `This session works in "${workingDirectory}", which this ` +
        middle +
        'Pick another place for it in the composer — starting it somewhere ' +
        'else would run it in a directory the session never named.',
      'configuration',
    )
  }

  /**
   * The ProviderExecutionHost contract's view of the catalog: the descriptors
   * alone. Derived from `describeCatalog` rather than built beside it, so the
   * two can never come to describe different providers.
   */
  async describe(): Promise<ProviderDescriptor[]> {
    const catalog = await this.describeCatalog()
    return catalog.providers.map((entry) => entry.descriptor)
  }

  start(providerId: string, config: SessionStartConfig): SessionHandle {
    this.assertProviderRunnable(providerId)
    this.assertWorkPlaceRunnable(config)

    const session = new RemoteSessionRun({
      providerId,
      config,
      host: this,
    })
    session.begin()
    return session.handle()
  }

  attach(
    providerId: string,
    config: SessionStartConfig,
    afterSeq: number,
  ): SessionHandle {
    // The one way a remote session continues: it is started once and every
    // later turn attaches to the run the daemon already has, at app boot for a
    // session that was still running and on send for one that had settled
    // (`session.service.ts`, `sendRemoteTurn`). A second start is refused by
    // the daemon with 409 `Session already exists`.
    //
    // No provider check of any kind -- not the listing one, not
    // `assertProviderRunnable`: an attach can happen at boot before the
    // provider cache is primed, and the provider was already validated when the
    // session originally started. Refusing here would strand a turn the daemon
    // is already running. Failures surface through the handle. The interface
    // doc on `attach` states this exemption rather than claiming `start`'s
    // checks (MAR-2682).
    const session = new RemoteSessionRun({
      providerId,
      config,
      host: this,
      resume: { afterSeq },
    })
    session.begin()
    return session.handle()
  }

  /** @internal Shared by RemoteSessionRun. */
  notifyEventSeq(sessionId: string, seq: number): void {
    this.deps.onEventSeq?.(sessionId, seq)
  }

  /** @internal Shared by RemoteSessionRun. */
  recordDebug(entry: ProviderDebugEntry): void {
    this.debugSink.record(entry)
  }

  /**
   * Fetches the workspace slice of the daemon's session snapshot: the
   * repository and branch the session runs in and the pull request the
   * daemon opened, when any. Throws RemoteExecutionHostError.
   */
  async fetchSessionWorkspaceInfo(
    sessionId: string,
  ): Promise<RemoteSessionWorkspaceInfo> {
    const connection = await this.resolveConnection()
    const snapshot = await this.requestJson(
      connection,
      `/v0/execution/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'GET' },
    )
    return parseRemoteSessionWorkspaceInfo(snapshot)
  }

  async oneShot(
    providerId: string,
    _input: OneShotInput,
  ): Promise<OneShotResult> {
    this.assertProviderRunnable(providerId)
    throw new Error(
      `Provider ${providerId} does not support one-shot execution`,
    )
  }

  async manageContext(
    providerId: string,
    _config: SessionStartConfig,
    _input: ProviderContextManagementInput,
  ): Promise<ProviderContextManagementResult> {
    this.assertProviderRunnable(providerId)
    throw new Error(
      'Manual context management is not supported on remote execution hosts yet',
    )
  }

  /**
   * The daemon connection in force, and the one place this host learns what
   * that is. Every wire call goes through here, so the moment any of them sees
   * a new address or token, everything cached from the old one becomes
   * unreadable (see `inForce`).
   *
   * @internal Shared by RemoteSessionRun.
   */
  async resolveConnection(): Promise<RemoteExecutionHostConnection> {
    try {
      const connection = await this.deps.connection.resolveConnection()
      this.configuration = daemonConfigurationFingerprint(connection)
      return connection
    } catch (error) {
      // An Endpoint that cannot be resolved gets its own configuration rather
      // than keeping the last good one, so nothing read from the address it
      // used to have survives its removal.
      this.configuration = UNRESOLVED_DAEMON_CONFIGURATION
      throw error
    }
  }

  /** @internal Shared by RemoteSessionRun. */
  async requestJson(
    connection: RemoteExecutionHostConnection,
    path: string,
    options: { method: 'GET' | 'POST' | 'DELETE'; body?: string },
  ): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetchFn(buildRemoteUrl(connection.baseUrl, path), {
        method: options.method,
        headers: {
          Authorization: `Bearer ${connection.token}`,
          ...(options.body !== undefined
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        ...(options.body !== undefined ? { body: options.body } : {}),
      })
    } catch (error) {
      throw new RemoteExecutionHostError(
        `Remote execution host is unreachable: ${errorMessage(error)}`,
        'network',
        undefined,
        error,
      )
    }

    const text = await response.text()
    if (!response.ok) {
      throw new RemoteExecutionHostError(
        extractErrorMessage(text) ??
          `Remote execution host request failed with ${response.status}.`,
        response.status === 401 || response.status === 403 ? 'auth' : 'http',
        response.status,
      )
    }
    if (!text.trim()) return {}
    try {
      return JSON.parse(text) as unknown
    } catch (error) {
      throw new RemoteExecutionHostError(
        'Remote execution host returned malformed JSON.',
        'malformed',
        response.status,
        error,
      )
    }
  }

  /** @internal Shared by RemoteSessionRun. */
  async openEventStream(
    connection: RemoteExecutionHostConnection,
    sessionId: string,
    lastSeq: number,
    signal: AbortSignal,
  ): Promise<Response> {
    let response: Response
    try {
      response = await this.fetchFn(
        buildRemoteUrl(
          connection.baseUrl,
          `/v0/execution/sessions/${encodeURIComponent(sessionId)}/events`,
        ),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${connection.token}`,
            Accept: 'text/event-stream',
            ...(lastSeq > 0 ? { 'Last-Event-ID': String(lastSeq) } : {}),
          },
          signal,
        },
      )
    } catch (error) {
      throw new RemoteExecutionHostError(
        `Remote execution host event stream is unreachable: ${errorMessage(error)}`,
        'network',
        undefined,
        error,
      )
    }
    if (!response.ok || !response.body) {
      throw new RemoteExecutionHostError(
        `Remote execution host event stream failed with ${response.status}.`,
        response.status === 401 || response.status === 403 ? 'auth' : 'http',
        response.status,
      )
    }
    return response
  }

  /** @internal Shared by RemoteSessionRun. */
  reconnectPolicy(): {
    maxAttempts: number
    delayMs: (attempt: number) => number
    wait: (ms: number) => Promise<void>
  } {
    return {
      maxAttempts: this.maxReconnectAttempts,
      delayMs: this.reconnectDelayMs,
      wait: this.wait,
    }
  }
}

interface RemoteSessionRunParams {
  providerId: string
  config: SessionStartConfig
  host: RemoteExecutionHost
  /** Present when reattaching to an already-running remote session. */
  resume?: { afterSeq: number }
}

/**
 * One remote session: owns the start request, the SSE consumption loop with
 * sequence-resumed reconnects, and command delivery. Failures surface through
 * the handle's deltas and status/attention events per the execution host
 * invariants — never as thrown errors after start.
 */
class RemoteSessionRun {
  private readonly deltaListeners: Array<(delta: SessionDelta) => void> = []
  private readonly statusListeners: Array<(status: SessionStatus) => void> = []
  private readonly attentionListeners: Array<
    (attention: AttentionState) => void
  > = []
  private readonly tokenListeners: Array<(token: string) => void> = []
  private readonly contextWindowListeners: Array<
    (contextWindow: SessionContextWindow) => void
  > = []
  private readonly activityListeners: Array<
    (activity: ActivitySignal) => void
  > = []
  private readonly heartbeatListeners: Array<() => void> = []

  private readonly emitter: ProviderSessionEmitter
  private readonly pendingCommands: ExecutionHostCommand[] = []
  private readonly abort = new AbortController()
  private connection: RemoteExecutionHostConnection | null = null
  private started = false
  private stopped = false
  private dead = false
  private lastSeq = 0

  constructor(private readonly params: RemoteSessionRunParams) {
    this.lastSeq = params.resume?.afterSeq ?? 0
    this.emitter = new ProviderSessionEmitter({
      providerId: params.providerId,
      emitDelta: (delta) => this.notifyDelta(delta),
    })
  }

  begin(): void {
    void this.run()
  }

  handle(): SessionHandle {
    return {
      onDelta: (callback) => this.deltaListeners.push(callback),
      onStatusChange: (callback) => this.statusListeners.push(callback),
      onAttentionChange: (callback) => this.attentionListeners.push(callback),
      onContinuationToken: (callback) => this.tokenListeners.push(callback),
      onContextWindowChange: (callback) =>
        this.contextWindowListeners.push(callback),
      onActivityChange: (callback) => this.activityListeners.push(callback),
      onActivityHeartbeat: (callback) => this.heartbeatListeners.push(callback),

      sendMessage: (text, attachments, skillSelections, options) =>
        this.enqueueCommand(
          buildWireSendMessageCommand(
            text,
            attachments,
            skillSelections,
            options,
          ),
        ),
      approve: (providerApprovalId) =>
        this.enqueueCommand(buildWireApproveCommand(providerApprovalId)),
      deny: (providerApprovalId) =>
        this.enqueueCommand(buildWireDenyCommand(providerApprovalId)),
      stop: () => this.stop(),
      dispose: () => this.dispose(),
    }
  }

  private async run(): Promise<void> {
    // Which step is in flight, so a failure below is logged as the thing that
    // actually failed. The one-start contract is audited by reading this log,
    // and an attach posts no start at all -- calling its connection failure
    // "start refused" writes evidence of a second start into the record of a
    // wire that permits exactly one. A message that misdescribes its own cause
    // is read under pressure and believed (MAR-2582).
    let step: 'connection' | 'start' = 'connection'
    try {
      this.connection = await this.params.host.resolveConnection()
      if (!this.params.resume) {
        step = 'start'
        // Recorded before the request, not after it. A session takes exactly
        // one start on this wire and the daemon answers a second with 409, so
        // "was a second one attempted?" is a question the log has to be able
        // to answer — and a log that only records the ones that succeeded
        // cannot answer it either way (MAR-2582).
        this.recordDebug('request', {
          direction: 'out',
          method: 'start',
          note: 'remote session start requested',
        })
        const response = await this.params.host.requestJson(
          this.connection,
          '/v0/execution/sessions',
          {
            method: 'POST',
            body: encodeExecutionStartRequest(
              buildWireStartRequest(this.params.providerId, this.params.config),
            ),
          },
        )
        parseRemoteExecutionHostStartResponse(response)
      }
    } catch (error) {
      const reason = describeRemoteExecutionHostFailure(error)
      const attempt = this.params.resume ? 'attach' : 'start'
      this.recordDebug('lifecycle', {
        direction: 'in',
        ...(error instanceof RemoteExecutionHostError && error.status
          ? { payload: { status: error.status } }
          : {}),
        note:
          step === 'start'
            ? `remote session start refused: ${reason}`
            : `remote session ${attempt} could not resolve a connection: ${reason}`,
      })
      this.failSession(
        this.params.resume
          ? `Remote session failed to attach: ${reason}`
          : `Remote session failed to start: ${reason}`,
      )
      return
    }

    this.recordDebug('lifecycle', {
      direction: 'out',
      note: this.params.resume
        ? `reattached to remote session after seq ${this.lastSeq}`
        : 'remote session start accepted by the daemon',
    })
    this.started = true
    await this.flushPendingCommands()
    await this.consumeEventStream()
  }

  private async consumeEventStream(): Promise<void> {
    const policy = this.params.host.reconnectPolicy()
    let attempt = 0

    while (!this.stopped && !this.dead) {
      let response: Response
      try {
        response = await this.params.host.openEventStream(
          this.requireConnection(),
          this.params.config.sessionId,
          this.lastSeq,
          this.abort.signal,
        )
        attempt = 0
        this.recordDebug('lifecycle', {
          direction: 'in',
          note: `event stream open from seq ${this.lastSeq}`,
        })
      } catch (error) {
        if (this.stopped) return
        attempt += 1
        if (attempt >= policy.maxAttempts) {
          this.failSession(
            `Remote session event stream is unavailable: ${describeRemoteExecutionHostFailure(error)}`,
          )
          return
        }
        await policy.wait(policy.delayMs(attempt))
        continue
      }

      await this.readStream(response)
      if (this.stopped || this.dead) return

      // The daemon holds the stream open for a live session; reaching the
      // end means the connection dropped. Resume from the last sequence.
      this.recordDebug('lifecycle', {
        direction: 'in',
        note: `event stream ended at seq ${this.lastSeq}; reconnecting`,
      })
      attempt += 1
      if (attempt >= policy.maxAttempts) {
        this.failSession(
          'Remote session event stream dropped and could not be re-established.',
        )
        return
      }
      await policy.wait(policy.delayMs(attempt))
    }
  }

  private async readStream(response: Response): Promise<void> {
    const body = response.body
    if (!body) return
    const reader = body.getReader()
    const decoder = new TextDecoder()
    const parser = createSseParser()

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        const events = parser.feed(decoder.decode(value, { stream: true }))
        // One read delivers a batch: a daemon replay writes its frames back to
        // back and they arrive coalesced. A listener that disposes the run on
        // the first of them must not be handed the rest, which `dispatchRawEvent`
        // decides per event rather than the loop deciding once -- an event
        // dropped for that reason is traced like every other drop.
        for (const event of events) {
          this.dispatchRawEvent(event.data)
        }
      }
    } catch {
      // Read errors (including aborts) fall through to the reconnect loop.
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Records one redacted line of wire traffic to the session debug log. The
   * remote host is the only adapter whose provider runs on another machine, so
   * the debug log is the only place a remote turn can be inspected at all —
   * every path that drops an event silently records why it dropped it.
   *
   * Where an entry survives is worth knowing before trusting one as evidence
   * (`provider-debug.service.ts`): every entry lands in an in-memory ring of
   * the last 500 per session, kept for at most 10 sessions and gone at quit,
   * and reaches a durable `<userData>/debug-logs/<sessionId>.jsonl` only while
   * "Capture provider debug logs" is on in settings — read at record time, so
   * a long turn traced with the setting off leaves no file behind.
   */
  private recordDebug(
    channel: ProviderDebugChannel,
    partial: Omit<
      ProviderDebugEntry,
      'sessionId' | 'providerId' | 'at' | 'channel'
    >,
  ): void {
    this.params.host.recordDebug({
      sessionId: this.params.config.sessionId,
      providerId: this.params.providerId,
      at: Date.now(),
      channel,
      ...partial,
    })
  }

  private dispatchRawEvent(raw: string): void {
    // A disposed run has no voice. Its listeners belong to a handle the
    // session service has already released, and an event delivered through
    // them lands on a session whose live turn is being served by a different
    // handle entirely (MAR-2582).
    if (this.stopped || this.dead) {
      this.recordDebug('event', {
        direction: 'in',
        bytes: raw.length,
        note: 'dropped: the run is disposed',
      })
      return
    }
    const decoded = decodeExecutionEventEnvelope(raw)
    if (!decoded.ok) {
      this.recordDebug('event', {
        direction: 'in',
        bytes: raw.length,
        note: `dropped: undecodable envelope (${decoded.reason})`,
      })
      return
    }
    const envelope = decoded.value
    if (envelope.sessionId !== this.params.config.sessionId) {
      this.recordDebug('event', {
        direction: 'in',
        bytes: raw.length,
        method: envelope.event.kind,
        note: 'dropped: envelope belongs to another session',
      })
      return
    }
    if (envelope.seq <= this.lastSeq) {
      this.recordDebug('event', {
        direction: 'in',
        bytes: raw.length,
        method: envelope.event.kind,
        payload: { seq: envelope.seq, lastSeq: this.lastSeq },
        note: 'dropped: already-seen sequence',
      })
      return
    }
    this.lastSeq = envelope.seq
    this.recordDebug('event', {
      direction: 'in',
      bytes: raw.length,
      method: envelope.event.kind,
      payload: {
        seq: envelope.seq,
        ...describeWireEventShape(envelope.event),
        ...(decoded.warnings?.length
          ? { decodeWarnings: decoded.warnings }
          : {}),
      },
    })
    this.dispatchEvent(envelope.event, envelope.seq)
    // The cursor write for every event that does not carry a session patch.
    // A `status` or `continuation-token` event has already committed this
    // sequence inside its own patch statement (`applySessionPatch`), and the
    // repository keeps the column monotonic, so this call is a no-op for
    // those rather than a second, later source of truth.
    this.params.host.notifyEventSeq(this.params.config.sessionId, envelope.seq)
  }

  /**
   * Three of these kinds carry facts the session record must keep, and the
   * listener arrays alone cannot deliver them: nothing in Convergence
   * subscribes to `onStatusChange`, `onAttentionChange` or
   * `onContinuationToken` — every provider implements them and no caller reads
   * them. The live path is the `session.patch` delta, which
   * `SessionService.applyDelta` writes to the session row.
   *
   * So `status`, `attention` and `continuation-token` do both halves, exactly
   * as `claude-code-provider.ts:511-513,518-521,540-541` does for a local run:
   * fire the callback for the handle's declared contract, and patch the
   * session for the reader that actually exists. Without the status patch a
   * remote turn never leaves `running` in the record, and a session stuck at
   * `running` treats the next message as mid-run input instead of a new turn —
   * half of what made every remote session one turn long (MAR-2582). Without
   * the attention patch a remote session never leaves `'none'`: it could not
   * report that it had finished, and an approval prompt raised on the far side
   * never reached the row a human reads (MAR-2590).
   *
   * Both patches carry the envelope's sequence. That is what lets the record
   * commit the patch and the stream cursor in one statement, and recognise the
   * same terminal event arriving twice when a stream is resumed from a cursor
   * that is behind the record.
   *
   * The token is patched because the daemon reports it and the session record
   * should hold what the daemon said, not because a second turn needs it. A
   * remote turn resumes by attaching to the run the daemon already has; a
   * continuation token that drove a second start was the other half of the
   * same defect (`session.service.ts`, `sendRemoteTurn`).
   *
   * `context-window` and `activity` are still callback-only. They are the same
   * shape of loss and they are not this fix; each changes UI behaviour Marcin
   * has not ruled on, so they are reported rather than quietly widened here.
   */
  private dispatchEvent(event: ExecutionHostEvent, seq: number): void {
    switch (event.kind) {
      case 'delta': {
        // A wire delta kind with no local counterpart is not forwarded — the
        // session service has no branch that could read it. It is still
        // evidence the daemon is working, though, and before the mapping layer
        // existed every delta reached applyDelta and bumped liveness on the way
        // in. The heartbeat keeps that signal without inventing a local delta.
        const delta = toLocalSessionDelta(event.delta)
        // A session patch that arrives as a wire *delta* settles the session
        // exactly as the dedicated `status` event does -- `applyDelta` ends
        // the turn on either -- so it is treated exactly the same way here. It
        // carries the sequence for the same two reasons (one write for the
        // patch and the cursor, and a replayed settle that can be recognised
        // as one), and it carries the attention its terminal status means, for
        // the same reason the dedicated event does: the settle and its outcome
        // are one fact. A patch that states an attention of its own keeps it,
        // and a patch with nothing to pair travels unchanged (MAR-2590).
        if (delta)
          this.notifyDelta(
            delta.kind === 'session.patch'
              ? {
                  ...delta,
                  patch: withSettledAttention(delta.patch),
                  executionHostSeq: seq,
                }
              : delta,
          )
        else {
          this.recordDebug('event', {
            direction: 'in',
            method: event.delta.kind,
            note: 'wire delta has no local counterpart; counted as liveness only',
          })
          this.notifyHeartbeat()
        }
        break
      }
      case 'status': {
        // A settle and the attention it carries are one fact, so they are one
        // write. Locally they always were: `claude-code-provider.ts:1071-1072`
        // sets `'completed'` and `'finished'` from the same event, and the
        // service applies the same pairing when it settles an approval nobody
        // is left to answer (`session.service.ts:1362-1368`). The daemon
        // instead splits them across two wire events, and the second one
        // arrives after this settle has released the handle -- so on the
        // remote path the attention half was simply lost, and a finished
        // remote session reported nothing to act on (MAR-2590).
        //
        // Pairing them here rather than letting the trailing frame through is
        // deliberate: the disposed-run guard in `dispatchRawEvent` is what
        // stops a released handle from overwriting the attention of the run
        // that replaced it, which is the class MAR-2582 spent seven rounds
        // closing. The daemon's own `attention` frame still arrives, now
        // carrying a value the row already holds, and is dropped and named.
        //
        // The pairing itself is `withSettledAttention`, shared with the delta
        // encoding above so the two ways a settle can arrive cannot drift.
        const settled = withSettledAttention({ status: event.status })
        for (const listener of this.statusListeners) listener(event.status)
        if (settled.attention)
          for (const listener of this.attentionListeners)
            listener(settled.attention)
        this.emitter.patchSession(settled, { executionHostSeq: seq })
        break
      }
      case 'attention':
        for (const listener of this.attentionListeners)
          listener(event.attention)
        this.emitter.patchSession(
          { attention: event.attention },
          { executionHostSeq: seq },
        )
        break
      case 'continuation-token':
        for (const listener of this.tokenListeners) listener(event.token)
        this.emitter.patchSession(
          { continuationToken: event.token },
          { executionHostSeq: seq },
        )
        break
      case 'context-window':
        for (const listener of this.contextWindowListeners)
          listener(event.contextWindow)
        break
      case 'activity':
        for (const listener of this.activityListeners) listener(event.activity)
        break
      case 'heartbeat':
        this.notifyHeartbeat()
        break
    }
  }

  private notifyDelta(delta: SessionDelta): void {
    for (const listener of this.deltaListeners) listener(delta)
  }

  private notifyHeartbeat(): void {
    for (const listener of this.heartbeatListeners) listener()
  }

  /**
   * Hands a command to the run, or says so when the run can no longer carry
   * it.
   *
   * A run that has failed or been disposed still answers `sendMessage`, and
   * returning from it is indistinguishable from delivering the message: the
   * daemon is what echoes a user turn back, so a message that never left the
   * app leaves nothing at all behind -- no turn, no error, no trace. That is
   * what a dead handle left installed on a session did to every message sent
   * into it, and the silence was its own half of the defect (MAR-2582). The
   * note is the one `postCommand` already gives a command the daemon refused;
   * this covers one that never got that far.
   *
   * Only commands a user issues arrive here -- send, approve, deny. `stop`
   * goes straight to `postCommand`, which is what lets it stay silent about a
   * run that is already gone.
   */
  private enqueueCommand(command: ExecutionHostCommand): void {
    if (this.stopped || this.dead) {
      this.emitter.addNote({
        text: 'Remote session command was not delivered: the remote run is no longer active.',
        level: 'error',
      })
      this.emitter.patchSession({ attention: 'failed' })
      for (const listener of this.attentionListeners) listener('failed')
      return
    }
    if (!this.started) {
      this.pendingCommands.push(command)
      return
    }
    void this.postCommand(command)
  }

  private async flushPendingCommands(): Promise<void> {
    while (this.pendingCommands.length > 0 && !this.dead) {
      const command = this.pendingCommands.shift()
      if (command) await this.postCommand(command)
    }
  }

  private async postCommand(command: ExecutionHostCommand): Promise<void> {
    this.recordDebug('request', {
      direction: 'out',
      method: command.kind,
      note: 'command posted to the daemon',
    })
    try {
      await this.params.host.requestJson(
        this.requireConnection(),
        `/v0/execution/sessions/${encodeURIComponent(
          this.params.config.sessionId,
        )}/commands`,
        {
          method: 'POST',
          body: encodeExecutionCommandEnvelope({
            protocolVersion: EXECUTION_PROTOCOL_VERSION,
            sessionId: this.params.config.sessionId,
            command,
          }),
        },
      )
    } catch (error) {
      if (command.kind === 'stop') return
      // A lost command must not be silent: surface attention with a note so
      // the user can retry, but keep the session alive — the remote run may
      // still be healthy.
      this.emitter.addNote({
        text: `Remote session command was not delivered: ${describeRemoteExecutionHostFailure(error)}`,
        level: 'error',
      })
      this.emitter.patchSession({ attention: 'failed' })
      for (const listener of this.attentionListeners) listener('failed')
    }
  }

  private stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.started) {
      void this.postCommand(buildWireStopCommand())
    }
    this.abort.abort()
  }

  private dispose(): void {
    if (this.stopped) return
    this.stopped = true
    this.pendingCommands.length = 0
    this.abort.abort()
  }

  private failSession(message: string): void {
    if (this.dead || this.stopped) return
    this.dead = true
    this.abort.abort()
    this.emitter.addNote({ text: message, level: 'error' })
    this.emitter.patchSession({ status: 'failed', attention: 'failed' })
    for (const listener of this.statusListeners) listener('failed')
    for (const listener of this.attentionListeners) listener('failed')
  }

  private requireConnection(): RemoteExecutionHostConnection {
    if (!this.connection) {
      throw new RemoteExecutionHostError(
        'Remote session connection is not resolved.',
        'configuration',
      )
    }
    return this.connection
  }
}

function buildRemoteUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

function extractErrorMessage(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { error?: unknown }
    return typeof parsed.error === 'string' && parsed.error.trim().length > 0
      ? parsed.error.trim()
      : null
  } catch {
    return text.trim().length > 0 ? text.trim() : null
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
