import type { Readable, Writable } from 'stream'
import { parseJsonLines } from '../line-parser'

export interface PiResponse {
  type: 'response'
  command: string
  id?: number
  success: boolean
  data?: unknown
  error?: string
}

export interface PiEvent {
  type: string
  [key: string]: unknown
}

export interface PiExtensionUiRequest {
  type: 'extension_ui_request'
  id: string
  method: string
  [key: string]: unknown
}

export type PiEventHandler = (event: PiEvent) => void
export type PiExtensionUiRequestHandler = (
  request: PiExtensionUiRequest,
) => void

type PendingCommand = {
  resolve: (response: PiResponse) => void
  reject: (err: Error) => void
}

export class PiRpcClient {
  private nextId = 1
  private pending = new Map<number, PendingCommand>()
  private eventHandler: PiEventHandler | null = null
  private extensionUiHandler: PiExtensionUiRequestHandler | null = null

  constructor(
    private stdin: Writable,
    stdout: Readable,
  ) {
    parseJsonLines(
      stdout,
      (data) => this.handleMessage(data),
      (err) => this.handleError(err),
    )
  }

  send(command: Record<string, unknown>): void {
    this.stdin.write(JSON.stringify(command) + '\n')
  }

  request(command: {
    type: string
    [key: string]: unknown
  }): Promise<PiResponse> {
    const id = this.nextId++
    this.send({ ...command, id })

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  sendExtensionUiResponse(id: string, payload: Record<string, unknown>): void {
    this.send({ type: 'extension_ui_response', id, ...payload })
  }

  onEvent(handler: PiEventHandler): void {
    this.eventHandler = handler
  }

  onExtensionUiRequest(handler: PiExtensionUiRequestHandler): void {
    this.extensionUiHandler = handler
  }

  destroy(): void {
    for (const [, { reject }] of this.pending) {
      reject(new Error('Client destroyed'))
    }
    this.pending.clear()
  }

  private handleMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return
    const msg = data as Record<string, unknown>
    const type = typeof msg.type === 'string' ? msg.type : null
    if (!type) return

    if (type === 'response') {
      const id = typeof msg.id === 'number' ? msg.id : null
      if (id !== null) {
        const pending = this.pending.get(id)
        if (pending) {
          this.pending.delete(id)
          pending.resolve(msg as unknown as PiResponse)
        }
      }
      return
    }

    if (type === 'extension_ui_request') {
      this.extensionUiHandler?.(msg as unknown as PiExtensionUiRequest)
      return
    }

    this.eventHandler?.(msg as unknown as PiEvent)
  }

  private handleError(err: Error): void {
    for (const [, { reject }] of this.pending) {
      reject(err)
    }
    this.pending.clear()
  }
}
