import type {
  InteractionResponse,
  SessionDelta,
} from '../../session/conversation-item.types'
import type { SkillSelection } from '../../skills/skills.types'
import { ProviderSessionEmitter } from '../provider-session.emitter'
import type {
  ActivitySignal,
  Attachment,
  AttentionState,
  MidRunInputMode,
  OneShotInput,
  OneShotResult,
  ProviderDescriptor,
  SessionContextWindow,
  SessionHandle,
  SessionStartConfig,
  SessionStatus,
} from '../provider.types'
import {
  decodeExecutionHostEventEnvelope,
  encodeExecutionHostCommandEnvelope,
  encodeExecutionHostStartRequest,
} from './execution-host-protocol.pure'
import type {
  ExecutionHostCommand,
  ExecutionHostEvent,
} from './execution-host-protocol.types'
import { EXECUTION_HOST_PROTOCOL_VERSION } from './execution-host-protocol.types'
import type {
  ExecutionHostProviderCapabilities,
  ProviderExecutionHost,
} from './execution-host.types'
import {
  buildRemoteExecutionHostStartRequest,
  describeRemoteExecutionHostFailure,
  capabilitiesForRemoteProvider,
  createSseParser,
  descriptorForRemoteProvider,
  parseRemoteExecutionHostMeta,
  parseRemoteExecutionHostStartResponse,
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

export interface RemoteExecutionHostDeps {
  connection: RemoteExecutionHostConnectionResolver
  fetch?: FetchFn
  reconnect?: {
    maxAttempts?: number
    delayMs?: (attempt: number) => number
    wait?: (ms: number) => Promise<void>
  }
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
  private providers: RemoteExecutionHostProviderInfo[] = []

  constructor(private readonly deps: RemoteExecutionHostDeps) {
    this.fetchFn = deps.fetch ?? fetch
    this.maxReconnectAttempts =
      deps.reconnect?.maxAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS
    this.reconnectDelayMs =
      deps.reconnect?.delayMs ?? remoteExecutionHostReconnectDelayMs
    this.wait =
      deps.reconnect?.wait ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  /**
   * Fetches the daemon provider listing and replaces the capability cache.
   * Throws RemoteExecutionHostError; on failure the previous cache stays in
   * place.
   */
  async refreshProviders(): Promise<RemoteExecutionHostProviderInfo[]> {
    const connection = await this.deps.connection.resolveConnection()
    const meta = await this.requestJson(connection, '/v0/meta', {
      method: 'GET',
    })
    this.providers = parseRemoteExecutionHostMeta(meta)
    return this.providers
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
          buildSendMessageCommand(text, attachments, skillSelections, options),
        ),
      approve: (providerApprovalId) =>
        this.enqueueCommand({ kind: 'approve', providerApprovalId }),
      deny: (providerApprovalId) =>
        this.enqueueCommand({ kind: 'deny', providerApprovalId }),
      stop: () => this.stop(),
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
            body: encodeExecutionHostStartRequest(
              buildRemoteExecutionHostStartRequest(
                this.params.providerId,
                this.params.config,
              ),
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
    const decoded = decodeExecutionHostEventEnvelope(raw)
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
      case 'delta':
        this.notifyDelta(event.delta)
        break
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
        for (const listener of this.heartbeatListeners) listener()
        break
    }
  }

  private notifyDelta(delta: SessionDelta): void {
    for (const listener of this.deltaListeners) listener(delta)
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
          body: encodeExecutionHostCommandEnvelope({
            protocolVersion: EXECUTION_HOST_PROTOCOL_VERSION,
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
      void this.postCommand({ kind: 'stop' })
    }
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

function buildSendMessageCommand(
  text: string,
  attachments?: Attachment[],
  skillSelections?: SkillSelection[],
  options?: {
    deliveryMode: MidRunInputMode
    queuedInputId?: string | null
    expectedProviderTurnId?: string | null
    interactionResponse?: InteractionResponse
  },
): ExecutionHostCommand {
  return {
    kind: 'send-message',
    text,
    ...(attachments ? { attachments } : {}),
    ...(skillSelections ? { skillSelections } : {}),
    ...(options ? { options } : {}),
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
