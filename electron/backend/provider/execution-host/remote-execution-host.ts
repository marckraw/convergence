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
} from './remote-execution-host.pure'
import {
  RemoteExecutionHostError,
  type RemoteExecutionHostConnection,
  type RemoteExecutionHostConnectionResolver,
  type RemoteExecutionHostProviderInfo,
} from './remote-execution-host.types'

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
  private providers: RemoteExecutionHostProviderInfo[] = []
  private handshakeResult: EndpointHandshakeResult | null = null
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
    const connection = await this.deps.connection.resolveConnection()
    // Started before the listing rather than after it: /health is
    // unauthenticated and independent, so it runs concurrently and usually
    // adds no wall-clock at all. When health is the slower half the refresh
    // costs max(meta, health), which is why the probe is capped: the added
    // latency is bounded, not zero. It never rejects, so a meta failure below
    // leaves nothing dangling.
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
    }
    return this.providers
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
    if (!this.capabilitiesFor(providerId)) {
      throw new Error(`Provider not found: ${providerId}`)
    }

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
    // No capability check: reattach happens at app boot before the provider
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
    if (!this.capabilitiesFor(providerId)) {
      throw new Error(`Provider not found: ${providerId}`)
    }
    throw new Error(
      `Provider ${providerId} does not support one-shot execution`,
    )
  }

  async manageContext(
    providerId: string,
    _config: SessionStartConfig,
    _input: ProviderContextManagementInput,
  ): Promise<ProviderContextManagementResult> {
    if (!this.capabilitiesFor(providerId)) {
      throw new Error(`Provider not found: ${providerId}`)
    }
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
    try {
      this.connection = await this.params.host.resolveConnection()
      if (!this.params.resume) {
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
      this.failSession(
        `Remote session failed to start: ${describeRemoteExecutionHostFailure(error)}`,
      )
      return
    }

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

  private dispatchRawEvent(raw: string): void {
    const decoded = decodeExecutionEventEnvelope(raw)
    if (!decoded.ok) return
    const envelope = decoded.value
    if (envelope.sessionId !== this.params.config.sessionId) return
    if (envelope.seq <= this.lastSeq) return
    this.lastSeq = envelope.seq
    this.dispatchEvent(envelope.event)
    this.params.host.notifyEventSeq(this.params.config.sessionId, envelope.seq)
  }

  private dispatchEvent(event: ExecutionHostEvent): void {
    switch (event.kind) {
      case 'delta': {
        // A wire delta kind with no local counterpart is not forwarded — the
        // session service has no branch that could read it. It is still
        // evidence the daemon is working, though, and before the mapping layer
        // existed every delta reached applyDelta and bumped liveness on the way
        // in. The heartbeat keeps that signal without inventing a local delta.
        const delta = toLocalSessionDelta(event.delta)
        if (delta) this.notifyDelta(delta)
        else this.notifyHeartbeat()
        break
      }
      case 'status':
        for (const listener of this.statusListeners) listener(event.status)
        break
      case 'attention':
        for (const listener of this.attentionListeners)
          listener(event.attention)
        break
      case 'continuation-token':
        for (const listener of this.tokenListeners) listener(event.token)
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

  private enqueueCommand(command: ExecutionHostCommand): void {
    if (this.stopped || this.dead) return
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
