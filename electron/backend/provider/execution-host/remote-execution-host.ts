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
  describeRemoteExecutionHostFailure,
  capabilitiesForRemoteProvider,
  createSseParser,
  descriptorForRemoteProvider,
  parseRemoteExecutionHostMeta,
  parseRemoteExecutionHostStartResponse,
  parseRemoteSessionWorkspaceInfo,
  type RemoteSessionWorkspaceInfo,
  remoteExecutionHostReconnectDelayMs,
  unavailableProviderError,
} from './remote-execution-host.pure'
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

export interface RemoteExecutionHostDeps {
  connection: RemoteExecutionHostConnectionResolver
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
 * Remote Execution Host: runs Providers on an agents-daemon behind the
 * execution host wire protocol. Sessions start with a POST, stream events
 * over SSE (resumed by sequence number on drops), and accept commands as
 * posted envelopes.
 *
 * Provider capability data comes from the daemon's /v0/meta listing and is
 * cached so the synchronous capabilities()/start() interface holds; call
 * refreshProviders() after construction and whenever the daemon connection
 * changes.
 */
export class RemoteExecutionHost implements ProviderExecutionHost {
  private readonly fetchFn: FetchFn
  private readonly maxReconnectAttempts: number
  private readonly reconnectDelayMs: (attempt: number) => number
  private readonly wait: (ms: number) => Promise<void>
  private readonly healthProbeTimeoutMs: number
  private readonly debugSink: ProviderDebugSink
  private providers: RemoteExecutionHostProviderInfo[] = []
  private handshakeResult: EndpointHandshakeResult | null = null
  /**
   * Whether a provider listing has ever landed. The cache alone cannot say:
   * a daemon that offers nothing and a daemon that was never asked both leave
   * `providers` empty, and only one of those is a fact about the daemon.
   */
  private listed = false
  /**
   * Why the most recent listing failed, kept so a refusal can name the real
   * reason instead of the absence it produced. Cleared by a listing that
   * lands, so a daemon that came back does not keep answering with the
   * outage that preceded it.
   */
  private listingFailure: Error | null = null
  /**
   * Bumped by every refresh so a slow one that finishes last cannot overwrite
   * a newer one's answer. Same reason Emergence's handshake service keeps one
   * per endpoint (`endpoint-handshake.service.ts:36-40`).
   */
  private refreshGeneration = 0

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
   * that reads handshake() next is never handed a mismatched pair.
   */
  async refreshProviders(): Promise<RemoteExecutionHostProviderInfo[]> {
    const generation = ++this.refreshGeneration
    try {
      const connection = await this.deps.connection.resolveConnection()
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
      if (generation === this.refreshGeneration) {
        this.providers = providers
        this.handshakeResult = handshake
        this.listed = true
        this.listingFailure = null
      }
      return this.providers
    } catch (error) {
      // Same generation guard as the success path, for the same reason: an
      // overtaken refresh must not report its failure over a newer one's
      // answer.
      if (generation === this.refreshGeneration) {
        this.listingFailure =
          error instanceof Error ? error : new Error(String(error))
      }
      throw error
    }
  }

  /**
   * What the daemon said about itself at the last successful refresh, or null
   * when it said nothing readable. Null is the honest answer for a daemon too
   * old to serve `/health`, and callers must treat it as "unknown", never as
   * "unsupported".
   */
  handshake(): EndpointHandshakeResult | null {
    return this.handshakeResult
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
    return this.providers.map(capabilitiesForRemoteProvider)
  }

  capabilitiesFor(
    providerId: string,
  ): ExecutionHostProviderCapabilities | null {
    const info = this.providers.find((p) => p.providerId === providerId)
    return info ? capabilitiesForRemoteProvider(info) : null
  }

  /**
   * Refuses a provider this host will not run, saying which of the two things
   * is wrong (MAR-2620).
   *
   * Every entry point that needs a provider asks here rather than reading the
   * cache itself. Three sites each writing `if (!capabilitiesFor(id)) throw`
   * is three places to relearn that an empty cache is not an answer -- and
   * `start()` had already learned it wrong, telling a reader "Provider not
   * found: claude-code" about a daemon that had simply not been asked yet.
   */
  private assertProviderListed(providerId: string): void {
    if (this.capabilitiesFor(providerId)) return
    throw unavailableProviderError({
      providerId,
      listed: this.listed,
      listingFailure: this.listingFailure,
    })
  }

  async describe(): Promise<ProviderDescriptor[]> {
    try {
      await this.refreshProviders()
    } catch {
      // Describe reflects the last known listing when the daemon is
      // unreachable; live failures surface through session flows instead.
    }
    return this.providers.map(descriptorForRemoteProvider)
  }

  start(providerId: string, config: SessionStartConfig): SessionHandle {
    this.assertProviderListed(providerId)

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
    // No capability check: an attach can happen at boot before the provider
    // cache is primed, and the provider was already validated when the
    // session originally started. Failures surface through the handle.
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
    this.assertProviderListed(providerId)
    throw new Error(
      `Provider ${providerId} does not support one-shot execution`,
    )
  }

  async manageContext(
    providerId: string,
    _config: SessionStartConfig,
    _input: ProviderContextManagementInput,
  ): Promise<ProviderContextManagementResult> {
    this.assertProviderListed(providerId)
    throw new Error(
      'Manual context management is not supported on remote execution hosts yet',
    )
  }

  /** @internal Shared by RemoteSessionRun. */
  async resolveConnection(): Promise<RemoteExecutionHostConnection> {
    return this.deps.connection.resolveConnection()
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
