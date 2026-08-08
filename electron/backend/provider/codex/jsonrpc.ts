import type { Readable, Writable } from 'stream'
import { parseJsonLines } from '../line-parser'

export type JsonRpcId = string | number

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: JsonRpcId
  method: string
  params?: unknown
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export type ServerRequestHandler = (
  method: string,
  params: unknown,
  id: JsonRpcId,
) => void

export type NotificationHandler = (method: string, params: unknown) => void

/**
 * How long each app-server method may stay silent before we call it hung.
 *
 * These are **silence** budgets, not total budgets: the clock restarts on every
 * byte the server sends (see `armBudget`). That distinction is what makes them
 * safe to apply to `turn/start`, whose response is an acknowledgement but whose
 * turn streams notifications for as long as the model works — a total budget
 * there would eventually kill healthy long turns, which is the exact failure
 * this era exists to stop.
 *
 * The numbers are patient on purpose. A cold `codex app-server` was measured at
 * 12.8s–28.0s just to answer `account/rateLimits/read`
 * (`codex-quota.constants.ts`), so anything tighter would call a slow start a
 * crash. A request that genuinely reaches one of these has produced no traffic
 * at all for a minute or more; it is hung, not slow.
 */
export const CODEX_RPC_BUDGETS_MS: Record<string, number> = {
  initialize: 60_000,
  'thread/start': 60_000,
  'thread/resume': 60_000,
  'thread/compact/start': 120_000,
  'model/list': 60_000,
  'skills/list': 60_000,
  'turn/start': 120_000,
  'turn/steer': 60_000,
  'turn/interrupt': 30_000,
}

export const DEFAULT_CODEX_RPC_BUDGET_MS = 60_000

export interface JsonRpcClientOptions {
  budgets?: Record<string, number>
  defaultBudgetMs?: number
  /**
   * Called when the connection itself failed — a silent server, a dead stdin,
   * an EPIPE. The owner of the process is expected to tear the client down and
   * respawn; the client only reports.
   */
  onTransportFailure?: (error: Error) => void
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  method: string
  budgetMs: number
  timer: ReturnType<typeof setTimeout> | null
}

export class JsonRpcClient {
  private nextId = 1
  private pending = new Map<JsonRpcId, PendingRequest>()
  private requestHandler: ServerRequestHandler | null = null
  private notificationHandler: NotificationHandler | null = null
  private budgets: Record<string, number>
  private defaultBudgetMs: number
  private onTransportFailure: ((error: Error) => void) | null
  private lastInboundAt = Date.now()
  private destroyed = false

  constructor(
    private stdin: Writable,
    stdout: Readable,
    options?: JsonRpcClientOptions,
  ) {
    this.budgets = options?.budgets ?? CODEX_RPC_BUDGETS_MS
    this.defaultBudgetMs =
      options?.defaultBudgetMs ?? DEFAULT_CODEX_RPC_BUDGET_MS
    this.onTransportFailure = options?.onTransportFailure ?? null

    parseJsonLines(
      stdout,
      (data) => this.handleMessage(data as JsonRpcMessage),
      (err) => this.handleError(err),
    )

    // Without this listener an EPIPE on a dead app-server is an unhandled
    // stream error, which takes the whole process with it (MAR-2316).
    stdin.on('error', (err: Error) => {
      this.reportTransportFailure(err)
    })
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      const budgetMs = this.budgets[method] ?? this.defaultBudgetMs
      this.pending.set(id, { resolve, reject, method, budgetMs, timer: null })

      try {
        this.send(msg)
      } catch (err) {
        this.pending.delete(id)
        const error = err instanceof Error ? err : new Error(String(err))
        reject(error)
        this.reportTransportFailure(error)
        return
      }

      this.armBudget(id)
    })
  }

  notify(method: string, params?: unknown): void {
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params }
    this.trySend(msg)
  }

  respond(id: JsonRpcId, result: unknown): void {
    const msg: JsonRpcResponse = { jsonrpc: '2.0', id, result }
    this.trySend(msg)
  }

  respondError(id: JsonRpcId, code: number, message: string): void {
    const msg: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    }
    this.trySend(msg)
  }

  onServerRequest(handler: ServerRequestHandler): void {
    this.requestHandler = handler
  }

  onNotification(handler: NotificationHandler): void {
    this.notificationHandler = handler
  }

  destroy(): void {
    this.destroyed = true
    this.onTransportFailure = null
    this.rejectAll(new Error('Client destroyed'))
  }

  /**
   * Re-arms a request's silence budget.
   *
   * The timer is allowed to fire early: what it checks is how long the server
   * has been quiet, so a request that saw traffic simply schedules the next
   * check for when that traffic would have gone stale.
   */
  private armBudget(id: JsonRpcId): void {
    const pending = this.pending.get(id)
    if (!pending) return

    const quietFor = Date.now() - this.lastInboundAt
    const remaining = pending.budgetMs - quietFor

    if (remaining <= 0) {
      this.pending.delete(id)
      const error = new Error(
        `Codex did not answer "${pending.method}" within ${Math.round(pending.budgetMs / 1000)}s`,
      )
      pending.reject(error)
      this.reportTransportFailure(error)
      return
    }

    pending.timer = setTimeout(() => this.armBudget(id), remaining)
    pending.timer.unref?.()
  }

  private clearBudget(pending: PendingRequest): void {
    if (pending.timer) {
      clearTimeout(pending.timer)
      pending.timer = null
    }
  }

  private trySend(msg: unknown): void {
    try {
      this.send(msg)
    } catch (err) {
      this.reportTransportFailure(
        err instanceof Error ? err : new Error(String(err)),
      )
    }
  }

  private send(msg: unknown): void {
    if (this.stdin.destroyed || this.stdin.writableEnded) {
      throw new Error('Codex process pipe is closed')
    }
    this.stdin.write(JSON.stringify(msg) + '\n')
  }

  private reportTransportFailure(error: Error): void {
    if (this.destroyed) return
    const handler = this.onTransportFailure
    this.rejectAll(error)
    handler?.(error)
  }

  private rejectAll(error: Error): void {
    const pending = [...this.pending.values()]
    this.pending.clear()
    for (const entry of pending) {
      this.clearBudget(entry)
      entry.reject(error)
    }
  }

  private handleMessage(msg: JsonRpcMessage): void {
    this.lastInboundAt = Date.now()

    // Response to our request (has id, has result/error, no method)
    if (
      'id' in msg &&
      ('result' in msg || 'error' in msg) &&
      !('method' in msg)
    ) {
      const response = msg as JsonRpcResponse
      const pending = this.pending.get(response.id)
      if (pending) {
        this.pending.delete(response.id)
        this.clearBudget(pending)
        if (response.error) {
          pending.reject(new Error(response.error.message))
        } else {
          pending.resolve(response.result)
        }
      }
      return
    }

    // Server request (has id AND method — server wants a response)
    if ('id' in msg && 'method' in msg) {
      const request = msg as JsonRpcRequest
      this.requestHandler?.(request.method, request.params, request.id)
      return
    }

    // Notification (has method, no id)
    if ('method' in msg && !('id' in msg)) {
      const notification = msg as JsonRpcNotification
      this.notificationHandler?.(notification.method, notification.params)
    }
  }

  private handleError(err: Error): void {
    this.rejectAll(err)
  }
}
