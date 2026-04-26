import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { PiProvider } from './pi-provider'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  private exited = false

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    this.emitExit(0)
    return true
  })

  emitExit(code: number): void {
    if (this.exited) {
      return
    }
    this.exited = true
    this.emit('exit', code)
  }
}

function waitFor(
  assertion: () => void,
  timeoutMs = 400,
  intervalMs = 10,
): Promise<void> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(error)
          return
        }

        setTimeout(attempt, intervalMs)
      }
    }

    attempt()
  })
}

function createPiServer(
  child: MockChildProcess,
  mode: 'stale' | 'fresh',
): void {
  let buffer = ''

  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)

      if (line) {
        const message = JSON.parse(line) as {
          id?: number
          type?: string
        }

        if (mode === 'stale' && message.type === 'prompt') {
          setTimeout(() => {
            child.stdout.write(
              JSON.stringify({
                type: 'response',
                command: 'prompt',
                id: message.id,
                success: false,
                error: 'session file not found',
              }) + '\n',
            )
          }, 0)
        }

        if (mode === 'fresh' && message.type === 'prompt') {
          setTimeout(() => {
            child.stdout.write(
              JSON.stringify({
                type: 'response',
                command: 'prompt',
                id: message.id,
                success: true,
              }) + '\n',
            )
            child.stdout.write(JSON.stringify({ type: 'agent_start' }) + '\n')
            child.stdout.write(
              JSON.stringify({
                type: 'message_update',
                assistantMessageEvent: {
                  type: 'text_delta',
                  delta: 'Recovered Pi reply',
                },
              }) + '\n',
            )
            child.stdout.write(
              JSON.stringify({
                type: 'message_update',
                assistantMessageEvent: { type: 'text_end' },
              }) + '\n',
            )
            child.stdout.write(
              JSON.stringify({
                type: 'agent_end',
                messages: [{ role: 'assistant', stopReason: 'stop' }],
              }) + '\n',
            )
          }, 0)
        }

        if (mode === 'fresh' && message.type === 'get_state') {
          setTimeout(() => {
            child.stdout.write(
              JSON.stringify({
                type: 'response',
                command: 'get_state',
                id: message.id,
                success: true,
                data: { sessionFile: '/tmp/fresh-pi-session.json' },
              }) + '\n',
            )
            setTimeout(() => {
              child.emitExit(0)
            }, 20)
          }, 0)
        }
      }

      newlineIndex = buffer.indexOf('\n')
    }
  })
}

function createPiCommandCaptureServer(
  child: MockChildProcess,
  options: { failCommandTypes?: string[] } = {},
): {
  requests: Array<{ type?: string; message?: string; id?: number }>
} {
  const requests: Array<{ type?: string; message?: string; id?: number }> = []
  const failCommandTypes = new Set(options.failCommandTypes ?? [])
  let buffer = ''

  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)

      if (line) {
        const message = JSON.parse(line) as {
          id?: number
          type?: string
          message?: string
        }
        requests.push(message)

        if (
          message.type === 'prompt' ||
          message.type === 'follow_up' ||
          message.type === 'steer'
        ) {
          const shouldFail = message.type
            ? failCommandTypes.has(message.type)
            : false
          setTimeout(() => {
            child.stdout.write(
              JSON.stringify({
                type: 'response',
                command: message.type,
                id: message.id,
                success: !shouldFail,
                error: shouldFail ? `${message.type} rejected` : undefined,
              }) + '\n',
            )
            if (message.type === 'prompt' && !shouldFail) {
              child.stdout.write(JSON.stringify({ type: 'agent_start' }) + '\n')
            }
          }, 0)
        }
      }

      newlineIndex = buffer.indexOf('\n')
    }
  })

  return { requests }
}

describe('PiProvider continuation recovery', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('retries once without --session when the stored Pi session file is gone', async () => {
    const staleChild = new MockChildProcess()
    const recoveredChild = new MockChildProcess()
    createPiServer(staleChild, 'stale')
    createPiServer(recoveredChild, 'fresh')

    spawnMock
      .mockReturnValueOnce(staleChild)
      .mockReturnValueOnce(recoveredChild)

    const provider = new PiProvider('/usr/local/bin/pi')
    const handle = provider.start({
      sessionId: 'session-pi',
      workingDirectory: process.cwd(),
      initialMessage: 'hello pi',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: '/tmp/stale-pi-session.json',
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const statuses: string[] = []
    const continuationTokens: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange((status) => {
      statuses.push(status)
    })
    handle.onContinuationToken((token) => {
      continuationTokens.push(token)
    })
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(spawnMock.mock.calls[0]?.[1]).toContain('--session')
    expect(spawnMock.mock.calls[0]?.[1]).toContain('/tmp/stale-pi-session.json')
    expect(spawnMock.mock.calls[1]?.[1]).not.toContain('--session')
    expect(statuses).not.toContain('failed')
    expect(continuationTokens).toEqual([
      '/tmp/stale-pi-session.json',
      '/tmp/fresh-pi-session.json',
    ])

    const userEntries = items.filter(
      (item) => item.kind === 'message' && item.actor === 'user',
    )
    expect(userEntries).toHaveLength(1)
    expect(userEntries[0]).toMatchObject({ text: 'hello pi' })
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          text: 'Pi Agent continuation was no longer available. Started a new session; previous provider context may be missing.',
        }),
        expect.objectContaining({
          kind: 'message',
          actor: 'assistant',
          text: 'Recovered Pi reply',
        }),
      ]),
    )
  })

  it('routes running follow-up and steer input to native Pi commands', async () => {
    const child = new MockChildProcess()
    const server = createPiCommandCaptureServer(child)
    spawnMock.mockReturnValue(child)

    const provider = new PiProvider('/usr/local/bin/pi')
    const handle = provider.start({
      sessionId: 'session-pi',
      workingDirectory: process.cwd(),
      initialMessage: 'hello pi',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
    })

    handle.onDelta(() => {})
    handle.onStatusChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(server.requests.some((request) => request.type === 'prompt')).toBe(
        true,
      )
    })

    handle.sendMessage('after this', undefined, undefined, {
      deliveryMode: 'follow-up',
    })
    handle.sendMessage('change direction', undefined, undefined, {
      deliveryMode: 'steer',
    })

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.type === 'follow_up'),
      ).toBe(true)
      expect(server.requests.some((request) => request.type === 'steer')).toBe(
        true,
      )
    })

    expect(server.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'follow_up',
          message: 'after this',
        }),
        expect.objectContaining({
          type: 'steer',
          message: 'change direction',
        }),
      ]),
    )
  })

  it('keeps the active Pi session running when mid-run follow-up is rejected', async () => {
    const child = new MockChildProcess()
    const server = createPiCommandCaptureServer(child, {
      failCommandTypes: ['follow_up'],
    })
    spawnMock.mockReturnValue(child)

    const provider = new PiProvider('/usr/local/bin/pi')
    const handle = provider.start({
      sessionId: 'session-pi',
      workingDirectory: process.cwd(),
      initialMessage: 'hello pi',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const statuses: string[] = []
    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange((status) => {
      statuses.push(status)
    })
    handle.onContinuationToken(() => {})
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(server.requests.some((request) => request.type === 'prompt')).toBe(
        true,
      )
    })

    handle.sendMessage('after this', undefined, undefined, {
      deliveryMode: 'follow-up',
    })

    await waitFor(() => {
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'note',
            level: 'error',
            text: 'Prompt failed: follow_up rejected',
          }),
        ]),
      )
    })

    expect(statuses).toContain('running')
    expect(statuses).not.toContain('failed')
  })
})
