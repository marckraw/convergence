import type { Readable, Writable } from 'stream'
import { RecordingError } from '../../session/session.pure'
import {
  formatCursorAcpSilenceBudgetDuration,
  redactCursorAcpPayload,
} from './cursor-acp-contract.pure'

export type CursorAcpJsonRpcId = string | number

export interface CursorAcpJsonRpcErrorPayload {
  code: number
  message: string
  data?: unknown
}

interface CursorAcpJsonRpcRequest extends Record<string, unknown> {
  jsonrpc: '2.0'
  id: CursorAcpJsonRpcId
  method: string
  params?: unknown
}

interface CursorAcpJsonRpcNotification extends Record<string, unknown> {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

interface CursorAcpJsonRpcResponse extends Record<string, unknown> {
  jsonrpc: '2.0'
  id: CursorAcpJsonRpcId
  result?: unknown
  error?: CursorAcpJsonRpcErrorPayload
}

type CursorAcpJsonRpcMessage =
  | CursorAcpJsonRpcRequest
  | CursorAcpJsonRpcNotification
  | CursorAcpJsonRpcResponse

export interface CursorAcpTransportDebugEntry {
  direction: 'in' | 'out'
  channel:
    | 'request'
    | 'response'
    | 'notification'
    | 'stdout'
    | 'stderr'
    | 'lifecycle'
  method?: string
  payload?: unknown
  bytes?: number
  note?: string
}

export type CursorAcpTransportDebugHandler = (
  entry: CursorAcpTransportDebugEntry,
) => void

export type CursorAcpServerRequestHandler = (
  method: string,
  params: unknown,
  id: CursorAcpJsonRpcId,
  client: CursorAcpJsonRpcClient,
) => void | Promise<void>

export type CursorAcpNotificationHandler = (
  method: string,
  params: unknown,
) => void

interface PendingRequest {
  method: string
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  /** Hard wall-clock timeout, or the silence-budget re-arm timer. */
  timeout: NodeJS.Timeout | null
  silenceBudgetMs: number | null
  lastProgressAt: number
  onSilenceExpired?: () => void
}

export interface CursorAcpJsonRpcClientOptions {
  requestTimeoutMs?: number
  onDebug?: CursorAcpTransportDebugHandler
}

export interface CursorAcpJsonRpcRequestOptions {
  timeoutMs?: number
  /**
   * Silence budget for this request (MAR-3142 R4). Re-armed by every inbound
   * notification while the request is pending. Distinct from `timeoutMs`, which
   * is a hard wall clock from send.
   */
  silenceBudgetMs?: number
  /** Called once when the silence budget expires, before the promise rejects. */
  onSilenceExpired?: () => void
}

export class CursorAcpJsonRpcError extends Error {
  constructor(
    message: string,
    public code: number,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'CursorAcpJsonRpcError'
  }
}

/** A request produced no progress for its silence budget (MAR-3142 R4). */
export class CursorAcpSilenceBudgetError extends Error {
  constructor(method: string, budgetMs: number) {
    super(
      `No word from Cursor for ${formatCursorAcpSilenceBudgetDuration(budgetMs)} while waiting for ${method}`,
    )
    this.name = 'CursorAcpSilenceBudgetError'
  }
}

export class CursorAcpJsonRpcClient {
  private nextId = 1
  private pending = new Map<CursorAcpJsonRpcId, PendingRequest>()
  /**
   * Server requests that still await a client answer. While any are open the
   * silence budget is suspended — waiting on the human is not Cursor silence
   * (MAR-3142 lap 2, B).
   */
  private awaitingHumanAnswers = new Set<CursorAcpJsonRpcId>()
  private requestHandler: CursorAcpServerRequestHandler | null = null
  private notificationHandler: CursorAcpNotificationHandler | null = null
  private buffer = ''
  private destroyed = false
  private requestTimeoutMs: number
  private onDebug: CursorAcpTransportDebugHandler | null

  private handleData = (chunk: Buffer | string): void => {
    this.buffer += chunk.toString()
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      this.handleLine(line)
    }
  }

  private handleEnd = (): void => {
    if (this.buffer.trim()) {
      this.handleLine(this.buffer)
      this.buffer = ''
    }

    this.rejectPending(new Error('Cursor ACP stdout ended'))
  }

  private handleStreamError = (err: Error): void => {
    this.rejectPending(err)
  }

  constructor(
    private stdin: Writable,
    private stdout: Readable,
    options: CursorAcpJsonRpcClientOptions = {},
  ) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.onDebug = options.onDebug ?? null

    stdout.on('data', this.handleData)
    stdout.on('end', this.handleEnd)
    stdout.on('error', this.handleStreamError)
  }

  request(
    method: string,
    params?: unknown,
    options: CursorAcpJsonRpcRequestOptions = {},
  ): Promise<unknown> {
    const id = this.nextId++
    const msg: CursorAcpJsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      const silenceBudgetMs =
        typeof options.silenceBudgetMs === 'number' &&
        options.silenceBudgetMs > 0
          ? options.silenceBudgetMs
          : null
      const requestTimeoutMs = options.timeoutMs ?? this.requestTimeoutMs

      const pending: PendingRequest = {
        method,
        resolve,
        reject,
        timeout: null,
        silenceBudgetMs,
        lastProgressAt: Date.now(),
        onSilenceExpired: options.onSilenceExpired,
      }
      this.pending.set(id, pending)

      try {
        this.send(msg, {
          direction: 'out',
          channel: 'request',
          method,
          payload: params,
        })
      } catch (error) {
        this.rejectPendingId(
          id,
          error instanceof Error ? error : new Error(String(error)),
        )
        return
      }

      if (silenceBudgetMs !== null) {
        this.armSilenceBudget(id)
        return
      }

      if (requestTimeoutMs > 0) {
        pending.timeout = setTimeout(() => {
          this.pending.delete(id)
          reject(
            new Error(
              `Timed out waiting for Cursor ACP ${method} after ${requestTimeoutMs}ms`,
            ),
          )
        }, requestTimeoutMs)
      }
    })
  }

  notify(method: string, params?: unknown): void {
    const msg: CursorAcpJsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    }
    this.send(msg, {
      direction: 'out',
      channel: 'notification',
      method,
      payload: params,
    })
  }

  respond(id: CursorAcpJsonRpcId, result: unknown): void {
    const msg: CursorAcpJsonRpcResponse = { jsonrpc: '2.0', id, result }
    this.send(msg, {
      direction: 'out',
      channel: 'response',
      payload: result,
    })
    this.releaseHumanAnswer(id)
  }

  respondError(
    id: CursorAcpJsonRpcId,
    code: number,
    message: string,
    data?: unknown,
  ): void {
    const msg: CursorAcpJsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: data === undefined ? { code, message } : { code, message, data },
    }
    this.send(msg, {
      direction: 'out',
      channel: 'response',
      payload: msg.error,
    })
    this.releaseHumanAnswer(id)
  }

  onServerRequest(handler: CursorAcpServerRequestHandler): void {
    this.requestHandler = handler
  }

  onNotification(handler: CursorAcpNotificationHandler): void {
    this.notificationHandler = handler
  }

  destroy(reason: string | Error = 'Cursor ACP client destroyed'): void {
    if (this.destroyed) return
    this.destroyed = true
    this.awaitingHumanAnswers.clear()
    this.stdout.off('data', this.handleData)
    this.stdout.off('end', this.handleEnd)
    this.stdout.off('error', this.handleStreamError)
    this.rejectPending(
      reason instanceof Error ? reason : new Error(String(reason)),
    )
  }

  private send(
    msg: CursorAcpJsonRpcMessage,
    debugEntry: CursorAcpTransportDebugEntry,
  ): void {
    if (this.destroyed) {
      throw new Error('Cursor ACP client is destroyed')
    }

    this.recordDebug(debugEntry)
    this.stdin.write(JSON.stringify(msg) + '\n')
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      this.recordDebug({
        direction: 'in',
        channel: 'stdout',
        bytes: Buffer.byteLength(line),
        note: 'malformed-json-line',
        payload: { line },
      })
      return
    }

    if (!isRecord(parsed)) {
      this.recordDebug({
        direction: 'in',
        channel: 'stdout',
        payload: parsed,
        note: 'invalid-jsonrpc-message',
      })
      return
    }

    this.handleMessage(parsed)
  }

  private handleMessage(message: Record<string, unknown>): void {
    if (isResponse(message)) {
      this.handleResponse(message)
      return
    }

    if (isServerRequest(message)) {
      this.handleServerRequest(message)
      return
    }

    if (isNotification(message)) {
      this.handleNotification(message)
      return
    }

    this.recordDebug({
      direction: 'in',
      channel: 'stdout',
      payload: message,
      note: 'unknown-jsonrpc-message',
    })
  }

  private handleResponse(response: CursorAcpJsonRpcResponse): void {
    const pending = this.pending.get(response.id)
    this.recordDebug({
      direction: 'in',
      channel: 'response',
      method: pending?.method,
      payload: response.error ?? response.result,
      note: pending ? undefined : 'unmatched-response',
    })

    if (!pending) return

    this.pending.delete(response.id)
    if (pending.timeout) clearTimeout(pending.timeout)

    if (response.error) {
      pending.reject(
        new CursorAcpJsonRpcError(
          response.error.message || 'Cursor ACP error',
          response.error.code,
          response.error.data,
        ),
      )
      return
    }

    pending.resolve(response.result)
  }

  private handleServerRequest(request: CursorAcpJsonRpcRequest): void {
    // A pending human answer is not silence — suspend until we respond
    // (MAR-3142 lap 2, B). Do not re-arm here.
    this.awaitingHumanAnswers.add(request.id)
    this.suspendSilenceBudgets()
    this.recordDebug({
      direction: 'in',
      channel: 'request',
      method: request.method,
      payload: request.params,
    })

    if (!this.requestHandler) {
      this.respondError(
        request.id,
        -32601,
        `Unsupported Cursor ACP server request: ${request.method}`,
      )
      return
    }

    try {
      void Promise.resolve(
        this.requestHandler(request.method, request.params, request.id, this),
      ).catch((error) => {
        if (error instanceof RecordingError) {
          console.error(
            `[cursor-acp] recording lost on server request ${request.method}`,
            error,
          )
          return
        }
        this.respondError(
          request.id,
          -32603,
          error instanceof Error ? error.message : String(error),
        )
      })
    } catch (error) {
      if (error instanceof RecordingError) {
        console.error(
          `[cursor-acp] recording lost on server request ${request.method}`,
          error,
        )
        return
      }
      this.respondError(
        request.id,
        -32603,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  private handleNotification(notification: CursorAcpJsonRpcNotification): void {
    this.noteSilenceProgress()
    this.recordDebug({
      direction: 'in',
      channel: 'notification',
      method: notification.method,
      payload: notification.params,
    })
    try {
      this.notificationHandler?.(notification.method, notification.params)
    } catch (error) {
      if (error instanceof RecordingError) {
        console.error(
          `[cursor-acp] recording lost on notification ${notification.method}`,
          error,
        )
        return
      }
      throw error
    }
  }

  /**
   * Re-arms every pending silence budget (Codex-shaped; MAR-3142 R4).
   * Inbound notifications count as progress. Server requests suspend instead.
   */
  private noteSilenceProgress(): void {
    if (this.awaitingHumanAnswers.size > 0) return
    const at = Date.now()
    for (const [id, pending] of this.pending) {
      if (pending.silenceBudgetMs === null) continue
      pending.lastProgressAt = at
      this.armSilenceBudget(id)
    }
  }

  /** Clears silence timers while a human answer is outstanding (lap 2, B). */
  private suspendSilenceBudgets(): void {
    for (const pending of this.pending.values()) {
      if (pending.silenceBudgetMs === null) continue
      if (pending.timeout) {
        clearTimeout(pending.timeout)
        pending.timeout = null
      }
    }
  }

  private releaseHumanAnswer(id: CursorAcpJsonRpcId): void {
    if (!this.awaitingHumanAnswers.delete(id)) return
    if (this.awaitingHumanAnswers.size > 0) return
    // Fresh quiet window from the moment the answer goes out.
    const at = Date.now()
    for (const [pendingId, pending] of this.pending) {
      if (pending.silenceBudgetMs === null) continue
      pending.lastProgressAt = at
      this.armSilenceBudget(pendingId)
    }
  }

  private armSilenceBudget(id: CursorAcpJsonRpcId): void {
    const pending = this.pending.get(id)
    if (!pending || pending.silenceBudgetMs === null) return
    if (this.awaitingHumanAnswers.size > 0) {
      if (pending.timeout) {
        clearTimeout(pending.timeout)
        pending.timeout = null
      }
      return
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout)
      pending.timeout = null
    }

    const quietFor = Date.now() - pending.lastProgressAt
    const remaining = pending.silenceBudgetMs - quietFor

    if (remaining <= 0) {
      this.pending.delete(id)
      try {
        pending.onSilenceExpired?.()
      } catch (error) {
        console.error(
          `[cursor-acp] onSilenceExpired failed for ${pending.method}`,
          error,
        )
      }
      pending.reject(
        new CursorAcpSilenceBudgetError(
          pending.method,
          pending.silenceBudgetMs,
        ),
      )
      return
    }

    pending.timeout = setTimeout(() => this.armSilenceBudget(id), remaining)
    pending.timeout.unref?.()
  }

  private rejectPending(error: Error): void {
    for (const [id] of this.pending) {
      this.rejectPendingId(id, error)
    }
  }

  private rejectPendingId(id: CursorAcpJsonRpcId, error: Error): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    if (pending.timeout) clearTimeout(pending.timeout)
    pending.reject(error)
  }

  private recordDebug(entry: CursorAcpTransportDebugEntry): void {
    if (!this.onDebug) return
    this.onDebug({
      ...entry,
      payload:
        entry.payload === undefined
          ? undefined
          : redactCursorAcpPayload(entry.payload),
    })
  }
}

function isResponse(
  value: Record<string, unknown>,
): value is CursorAcpJsonRpcResponse {
  return (
    isJsonRpcId(value.id) &&
    !('method' in value) &&
    ('result' in value || 'error' in value)
  )
}

function isServerRequest(
  value: Record<string, unknown>,
): value is CursorAcpJsonRpcRequest {
  return isJsonRpcId(value.id) && typeof value.method === 'string'
}

function isNotification(
  value: Record<string, unknown>,
): value is CursorAcpJsonRpcNotification {
  return !('id' in value) && typeof value.method === 'string'
}

function isJsonRpcId(value: unknown): value is CursorAcpJsonRpcId {
  return typeof value === 'string' || typeof value === 'number'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
