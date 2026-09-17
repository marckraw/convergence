import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { vi } from 'vitest'

/**
 * Fake Cursor ACP child + scripted JSON-RPC replies for provider tests
 * (MAR-3143 / CP2). Extracted from the former inline switch in
 * `cursor-provider.test.ts` so CP1 can share the same fixture.
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
  availableCommands?: string[]
}

export interface MockCursorAcpServer {
  requests: Array<{ method: string; params?: Record<string, unknown> }>
  responses: Array<{ id: string | number; result?: unknown }>
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
  const responses: Array<{ id: string | number; result?: unknown }> = []
  let heldPromptId: string | number | null = null
  let heldInitializeId: string | number | null = null
  let buffer = ''

  function send(message: unknown): void {
    child.stdout.write(JSON.stringify(message) + '\n')
  }

  function respond(id: string | number, result: unknown): void {
    setTimeout(() => {
      send({ jsonrpc: '2.0', id, result })
    }, 0)
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
      }

      if ('id' in message && !message.method) {
        responses.push({
          id: message.id as string | number,
          result: message.result,
        })
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
            respond(message.id, {
              sessionId: 'cursor-session-1',
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
            })
            break
          case 'session/load':
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
        }
      }
    }
  })

  return {
    requests,
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
