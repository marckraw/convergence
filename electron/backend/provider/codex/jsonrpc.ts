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

export class JsonRpcClient {
  private nextId = 1
  private pending = new Map<
    JsonRpcId,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >()
  private requestHandler: ServerRequestHandler | null = null
  private notificationHandler: NotificationHandler | null = null

  constructor(
    private stdin: Writable,
    stdout: Readable,
  ) {
    parseJsonLines(
      stdout,
      (data) => this.handleMessage(data as JsonRpcMessage),
      (err) => this.handleError(err),
    )
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    this.send(msg)

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  notify(method: string, params?: unknown): void {
    const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params }
    this.send(msg)
  }

  respond(id: JsonRpcId, result: unknown): void {
    const msg: JsonRpcResponse = { jsonrpc: '2.0', id, result }
    this.send(msg)
  }

  respondError(id: JsonRpcId, code: number, message: string): void {
    const msg: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    }
    this.send(msg)
  }

  onServerRequest(handler: ServerRequestHandler): void {
    this.requestHandler = handler
  }

  onNotification(handler: NotificationHandler): void {
    this.notificationHandler = handler
  }

  destroy(): void {
    for (const [, { reject }] of this.pending) {
      reject(new Error('Client destroyed'))
    }
    this.pending.clear()
  }

  private send(msg: unknown): void {
    this.stdin.write(JSON.stringify(msg) + '\n')
  }

  private handleMessage(msg: JsonRpcMessage): void {
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
    for (const [, { reject }] of this.pending) {
      reject(err)
    }
    this.pending.clear()
  }
}
