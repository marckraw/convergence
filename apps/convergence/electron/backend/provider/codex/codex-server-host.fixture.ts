import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'
import type { JsonRpcTransport } from './jsonrpc'

/**
 * Test doubles for the resident Codex app-server (MAR-2823).
 *
 * The fake speaks the real protocol shapes measured against codex-cli 0.153.4
 * on 2026-09-05 — including the ones that bite: `thread/started` broadcasts to
 * every connection, `thread/unsubscribe` answers with a status instead of an
 * error, and a thread with no turn yet refuses `thread/resume` with
 * "no rollout found".
 */

/**
 * Returned by `onRequest` for a request the server accepts and never answers —
 * the shape a turn takes when the socket dies after the server took it.
 */
export const FAKE_CODEX_NO_RESPONSE = Symbol('fake-codex-no-response')

export interface FakeCodexClientMessage {
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: unknown
}

export class FakeCodexConnection {
  readonly sent: FakeCodexClientMessage[] = []
  closed = false
  private dataHandler: ((chunk: string) => void) | null = null
  private errorHandler: ((error: Error) => void) | null = null
  private buffered: string[] = []

  constructor(
    private readonly onMessage: (
      message: FakeCodexClientMessage,
      connection: FakeCodexConnection,
    ) => void,
  ) {}

  readonly transport: JsonRpcTransport = {
    send: (text: string) => {
      if (this.closed) throw new Error('Codex app-server connection is closed')
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        const message = JSON.parse(line) as FakeCodexClientMessage
        this.sent.push(message)
        this.onMessage(message, this)
      }
    },
    close: () => {
      this.closed = true
    },
    onData: (handler) => {
      this.dataHandler = handler
      const pending = this.buffered.splice(0, this.buffered.length)
      for (const chunk of pending) handler(chunk)
    },
    onError: (handler) => {
      this.errorHandler = handler
    },
  }

  /** Server → client. */
  push(message: unknown): void {
    if (this.closed) return
    const line = JSON.stringify(message) + '\n'
    if (this.dataHandler) {
      this.dataHandler(line)
      return
    }
    this.buffered.push(line)
  }

  respond(id: number | string, result: unknown): void {
    this.push({ jsonrpc: '2.0', id, result })
  }

  respondError(id: number | string, message: string, code = -32600): void {
    this.push({ jsonrpc: '2.0', id, error: { code, message } })
  }

  notify(method: string, params?: unknown): void {
    this.push({ jsonrpc: '2.0', method, params })
  }

  /** The socket dying underneath a live client. */
  fail(message: string): void {
    this.closed = true
    this.errorHandler?.(new Error(message))
  }

  methods(): string[] {
    return this.sent
      .filter((message) => typeof message.method === 'string')
      .map((message) => message.method as string)
  }
}

export interface FakeCodexServerOptions {
  /** Thread ids the server has never heard of (`thread/resume` refuses them). */
  missingThreadIds?: string[]
  /** Thread ids with no turn yet (`no rollout found`, as measured). */
  unmaterializedThreadIds?: string[]
  threadIdSequence?: string[]
  /** Ids for successive `thread/start` calls. Defaults to `thread-N`. */
  threadIdFactory?: (count: number) => string
  steerError?: string
  turnId?: string
  /** Alias kept for the turn-id the server reports on `turn/started`. */
  turnStartedId?: string
  modelListResponse?: unknown
  skillsResponse?: unknown
  rateLimitsResponse?: unknown
  turnsListResponse?: (threadId: string) => unknown
  autoCompleteTurns?: boolean
  /** Methods the server accepts and never answers. */
  silentMethods?: string[]
  /** Delay before `thread/start` answers, standing in for a slow server. */
  threadStartDelayMs?: number
  /** How many opening `thread/start` calls answer without an id at all. */
  threadStartWithoutIdCount?: number
  /**
   * Answers a request before the defaults do. Returning `undefined` falls
   * through; throwing sends an error response.
   */
  onRequest?: (
    message: FakeCodexClientMessage,
    connection: FakeCodexConnection,
    server: FakeCodexServer,
  ) => unknown
}

/**
 * One running app-server, with every connection ever opened against it.
 */
export class FakeCodexServer {
  readonly connections: FakeCodexConnection[] = []
  readonly requests: Array<{
    method: string
    params?: Record<string, unknown>
    connection: FakeCodexConnection
  }> = []
  private threadCounter = 0
  private threadStartCount = 0

  constructor(private readonly options: FakeCodexServerOptions = {}) {}

  connect(): JsonRpcTransport {
    const connection = new FakeCodexConnection((message, self) =>
      this.handle(message, self),
    )
    this.connections.push(connection)
    return connection.transport
  }

  /** What the real server does with `thread/started` and status changes. */
  broadcast(method: string, params: unknown): void {
    for (const connection of this.connections) connection.notify(method, params)
  }

  methodsCalled(): string[] {
    return this.requests.map((request) => request.method)
  }

  private nextThreadId(): string {
    const scripted = this.options.threadIdSequence?.[this.threadCounter]
    this.threadCounter += 1
    return (
      scripted ??
      this.options.threadIdFactory?.(this.threadCounter) ??
      `thread-${this.threadCounter}`
    )
  }

  /** Server → the newest connection, as a raw JSON-RPC line. */
  pushRaw(line: string): void {
    this.connections[this.connections.length - 1]?.push(JSON.parse(line.trim()))
  }

  /** Everything the client answered a server request with. */
  get responses(): Array<{
    id: string | number
    result?: unknown
    error?: unknown
  }> {
    return this.connections.flatMap((connection) =>
      connection.sent
        .filter(
          (message) => message.id !== undefined && message.method === undefined,
        )
        .map((message) => ({
          id: message.id as string | number,
          result: message.result,
          error: message.error,
        })),
    )
  }

  private handle(
    message: FakeCodexClientMessage,
    connection: FakeCodexConnection,
  ): void {
    const { id, method, params } = message
    if (typeof method !== 'string' || id === undefined) return
    this.requests.push({ method, params, connection })

    if (this.options.silentMethods?.includes(method)) return

    let overridden: unknown
    if (this.options.onRequest) {
      try {
        overridden = this.options.onRequest(message, connection, this)
      } catch (err) {
        connection.respondError(
          id,
          err instanceof Error ? err.message : String(err),
        )
        return
      }
      if (overridden === FAKE_CODEX_NO_RESPONSE) return
      if (overridden !== undefined) {
        connection.respond(id, overridden)
        return
      }
    }

    switch (method) {
      case 'initialize':
        connection.respond(id, { userAgent: 'fake-codex/0.153.4' })
        return

      case 'thread/start': {
        const withoutId =
          this.threadStartCount < (this.options.threadStartWithoutIdCount ?? 0)
        this.threadStartCount += 1
        const threadId = withoutId ? null : this.nextThreadId()
        const answer = () => {
          // Measured order (0.153.4): the broadcast reaches every connection
          // BEFORE the starter's own response arrives. A session that takes
          // its id from the notification therefore takes the wrong one.
          if (threadId) {
            this.broadcast('thread/started', { thread: { id: threadId } })
          }
          connection.respond(id, threadId ? { thread: { id: threadId } } : {})
        }
        if (this.options.threadStartDelayMs) {
          setTimeout(answer, this.options.threadStartDelayMs)
        } else {
          answer()
        }
        return
      }

      case 'thread/resume': {
        const threadId = String(params?.threadId ?? 'resumed-thread')
        if (this.options.missingThreadIds?.includes(threadId)) {
          connection.respondError(id, `thread not found: ${threadId}`)
          return
        }
        if (this.options.unmaterializedThreadIds?.includes(threadId)) {
          connection.respondError(
            id,
            `no rollout found for thread id ${threadId}`,
          )
          return
        }
        connection.respond(id, { thread: { id: threadId } })
        return
      }

      case 'turn/start': {
        const threadId = String(params?.threadId ?? '')
        if (this.options.missingThreadIds?.includes(threadId)) {
          connection.respondError(id, `thread not found: ${threadId}`)
          return
        }
        const turnId =
          this.options.turnId ?? this.options.turnStartedId ?? 'turn-1'
        connection.respond(id, { turn: { id: turnId, status: 'inProgress' } })
        connection.notify('turn/started', { turn: { id: turnId } })
        if (this.options.autoCompleteTurns !== false) {
          connection.notify('turn/completed', {
            turn: { id: turnId, status: 'completed' },
          })
        }
        return
      }

      case 'turn/steer':
        if (this.options.steerError) {
          connection.respondError(id, this.options.steerError)
          return
        }
        connection.respond(id, {})
        return

      case 'turn/interrupt':
        connection.respond(id, {})
        return

      case 'thread/compact/start':
        connection.respond(id, {})
        connection.notify('thread/compacted', { threadId: params?.threadId })
        return

      case 'thread/unsubscribe':
        connection.respond(id, { status: 'unsubscribed' })
        return

      case 'thread/turns/list': {
        const threadId = String(params?.threadId ?? '')
        if (this.options.unmaterializedThreadIds?.includes(threadId)) {
          connection.respondError(
            id,
            `thread ${threadId} is not materialized yet; thread/turns/list is unavailable before first user message`,
          )
          return
        }
        connection.respond(
          id,
          this.options.turnsListResponse?.(threadId) ?? {
            data: [],
            nextCursor: null,
          },
        )
        return
      }

      case 'model/list':
        connection.respond(id, this.options.modelListResponse ?? { data: [] })
        return

      case 'skills/list':
        connection.respond(id, this.options.skillsResponse ?? { skills: [] })
        return

      case 'account/rateLimits/read':
        connection.respond(id, this.options.rateLimitsResponse ?? {})
        return

      default:
        connection.respond(id, {})
    }
  }
}

export class FakeCodexChildProcess extends EventEmitter {
  stdin = null
  stdout = null
  stderr = new EventEmitter()
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  readonly signals: Array<NodeJS.Signals | undefined> = []
  readonly pid: number

  /**
   * @param options.ignoresSigterm a server wedged on its own state — it takes
   * the signal and stays alive, which is the only case where the escalation to
   * SIGKILL is what stops it outliving the app.
   * @param options.pid the shim's own pid, so a test can hang a fake process
   * tree off it and watch which pids the escalation reaches.
   * @param options.onKill records every signal this process is sent, in the
   * same journal as the ones sent to its descendants by pid.
   */
  constructor(
    private readonly options: {
      ignoresSigterm?: boolean
      pid?: number
      onKill?: (pid: number, signal: NodeJS.Signals) => void
    } = {},
  ) {
    super()
    this.pid = options.pid ?? 4242
  }

  kill = (signal?: NodeJS.Signals): boolean => {
    this.signals.push(signal)
    this.options.onKill?.(this.pid, signal ?? 'SIGTERM')
    if (this.options.ignoresSigterm && signal !== 'SIGKILL') return true
    this.exit(null, signal ?? 'SIGTERM')
    return true
  }

  announceListening(url: string): void {
    this.stderr.emit(
      'data',
      Buffer.from(
        `codex app-server (WebSockets)\n  listening on: ${url}\n  readyz: ${url.replace('ws://', 'http://')}/readyz\n`,
      ),
    )
  }

  log(text: string): void {
    this.stderr.emit('data', Buffer.from(text))
  }

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.exitCode !== null || this.signalCode !== null) return
    this.exitCode = code
    this.signalCode = signal
    this.emit('exit', code, signal)
  }

  asChildProcess(): ChildProcess {
    return this as unknown as ChildProcess
  }
}
