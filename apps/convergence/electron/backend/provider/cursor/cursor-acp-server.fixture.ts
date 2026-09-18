import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { vi } from 'vitest'

/**
 * Fake Cursor ACP child + scripted JSON-RPC replies for provider tests
 * (MAR-3143 / CP2; grown for MAR-3142 / CP1).
 */
export class MockCursorAcpChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null

  kill = vi.fn((signal?: NodeJS.Signals) => {
    this.killed = true
    this.exitCode = signal === 'SIGKILL' ? 137 : 0
    this.signalCode = signal ?? null
    this.emit('exit', this.exitCode, this.signalCode)
    return true
  })
}

export interface MockCursorAcpOptions {
  holdPrompt?: boolean
  /** Hold `initialize` so tests can inject server requests before any prompt. */
  holdInitialize?: boolean
  /** Refuse `session/load` with a not-found style error (MAR-3142 R5). */
  refuseSessionLoad?: boolean | { code?: number; message: string }
  availableCommands?: string[]
  /**
   * Record `session/cancel` without resolving a held prompt (MAR-3142 lap 2, A).
   * Lets a test finish the prompt as `end_turn` after interrupt to pin sticky-flag clearing.
   */
  ignoreCancel?: boolean
}

export interface MockCursorAcpServer {
  requests: Array<{ method: string; params?: Record<string, unknown> }>
  notifications: Array<{ method: string; params?: Record<string, unknown> }>
  responses: Array<{ id: string | number; result?: unknown; error?: unknown }>
  send: (message: unknown) => void
  resolveHeldPrompt: (result: unknown) => void
  resolveHeldInitialize: () => void
}

export function createMockCursorAcp(
  child: MockCursorAcpChild,
  options: MockCursorAcpOptions = {},
): MockCursorAcpServer {
  const requests: Array<{ method: string; params?: Record<string, unknown> }> =
    []
  const notifications: Array<{
    method: string
    params?: Record<string, unknown>
  }> = []
  const responses: Array<{
    id: string | number
    result?: unknown
    error?: unknown
  }> = []
  let heldPromptId: string | number | null = null
  let heldInitializeId: string | number | null = null
  let buffer = ''
  let nextSessionOrdinal = 1

  function send(message: unknown): void {
    child.stdout.write(JSON.stringify(message) + '\n')
  }

  function respond(id: string | number, result: unknown): void {
    setTimeout(() => {
      send({ jsonrpc: '2.0', id, result })
    }, 0)
  }

  function respondError(
    id: string | number,
    code: number,
    message: string,
  ): void {
    setTimeout(() => {
      send({ jsonrpc: '2.0', id, error: { code, message } })
    }, 0)
  }

  function sessionNewResult(): Record<string, unknown> {
    const sessionId = `cursor-session-${nextSessionOrdinal}`
    nextSessionOrdinal += 1
    return {
      sessionId,
      configOptions: [
        {
          id: 'model',
          currentValue: 'default[]',
          options: [
            { value: 'default[]', label: 'Auto' },
            {
              value: 'composer-2.5[context=300k,fast=true]',
              label: 'Composer 2.5 Fast',
            },
          ],
        },
      ],
    }
  }

  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
      if (!line) continue

      const message = JSON.parse(line) as {
        id?: string | number
        method?: string
        params?: Record<string, unknown>
        result?: unknown
        error?: unknown
      }

      if ('id' in message && !message.method) {
        responses.push({
          id: message.id as string | number,
          result: message.result,
          error: message.error,
        })
        continue
      }

      // Outbound notification (no id) — CP1 cancel (MAR-3142 R2).
      if (message.method && message.id === undefined) {
        notifications.push({
          method: message.method,
          params: message.params,
        })
        if (
          message.method === 'session/cancel' &&
          heldPromptId !== null &&
          !options.ignoreCancel
        ) {
          respond(heldPromptId, { stopReason: 'cancelled' })
          heldPromptId = null
        }
        continue
      }

      if (message.id !== undefined && message.method) {
        requests.push({ method: message.method, params: message.params })
        switch (message.method) {
          case 'initialize':
            if (options.holdInitialize) {
              heldInitializeId = message.id
              break
            }
            respond(message.id, { protocolVersion: 1 })
            break
          case 'authenticate':
            respond(message.id, {})
            break
          case 'session/new':
            respond(message.id, sessionNewResult())
            break
          case 'session/load': {
            if (options.refuseSessionLoad) {
              const refusal =
                typeof options.refuseSessionLoad === 'object'
                  ? options.refuseSessionLoad
                  : {
                      code: -32000,
                      message: 'Session not found',
                    }
              respondError(message.id, refusal.code ?? -32000, refusal.message)
              break
            }
            send({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId: message.params?.sessionId,
                update: {
                  sessionUpdate: 'agent_message_chunk',
                  content: { type: 'text', text: 'old transcript' },
                },
              },
            })
            if (options.availableCommands) {
              send({
                jsonrpc: '2.0',
                method: 'session/update',
                params: {
                  sessionId: message.params?.sessionId,
                  update: {
                    sessionUpdate: 'available_commands_update',
                    availableCommands: options.availableCommands.map(
                      (name) => ({ name, description: `${name} command` }),
                    ),
                  },
                },
              })
            }
            respond(message.id, null)
            break
          }
          case 'session/prompt':
            if (options.holdPrompt) {
              heldPromptId = message.id
              break
            }
            send({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId: message.params?.sessionId,
                update: {
                  sessionUpdate: 'agent_message_chunk',
                  content: { type: 'text', text: 'hello ' },
                },
              },
            })
            send({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId: message.params?.sessionId,
                update: {
                  sessionUpdate: 'agent_message_chunk',
                  content: { type: 'text', text: 'world' },
                },
              },
            })
            respond(message.id, { stopReason: 'end_turn' })
            break
          case 'session/set_config_option':
            respond(message.id, {})
            break
          case 'session/cancel':
            // Cancel as a *request* is rejected on the measured CLI (CP0).
            respondError(
              message.id,
              -32601,
              '"Method not found": session/cancel',
            )
            break
        }
      }
    }
  })

  return {
    requests,
    notifications,
    responses,
    send,
    resolveHeldPrompt(result: unknown): void {
      if (heldPromptId === null) {
        throw new Error('No held Cursor prompt request')
      }
      respond(heldPromptId, result)
      heldPromptId = null
    },
    resolveHeldInitialize(): void {
      if (heldInitializeId === null) {
        throw new Error('No held Cursor initialize request')
      }
      respond(heldInitializeId, { protocolVersion: 1 })
      heldInitializeId = null
    },
  }
}
