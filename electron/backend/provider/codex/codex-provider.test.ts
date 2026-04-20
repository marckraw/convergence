import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptEntry } from '../provider.types'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CodexProvider } from './codex-provider'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false

  kill = vi.fn((signal?: NodeJS.Signals) => {
    this.killed = true
    this.emit('exit', signal === 'SIGKILL' ? 137 : 0)
    return true
  })
}

function waitFor(
  assertion: () => void,
  timeoutMs = 250,
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

function createMockCodexServer(child: MockChildProcess): void {
  let buffer = ''
  const enqueue = (fn: () => void) => {
    setTimeout(fn, 0)
  }

  const respond = (id: number, result: unknown) => {
    enqueue(() => {
      child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
    })
  }

  const reject = (id: number, message: string) => {
    enqueue(() => {
      child.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message },
        }) + '\n',
      )
    })
  }

  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)

      if (line) {
        const message = JSON.parse(line) as {
          id?: number
          method?: string
          params?: { threadId?: string }
        }

        if (message.method === 'initialize' && typeof message.id === 'number') {
          respond(message.id, {})
        } else if (
          message.method === 'turn/start' &&
          typeof message.id === 'number'
        ) {
          if (message.params?.threadId === 'dead-thread') {
            reject(message.id, 'thread not found: dead-thread')
          } else {
            respond(message.id, {})
            enqueue(() => {
              child.stdout.write(
                JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'turn/completed',
                  params: { turn: { status: 'completed' } },
                }) + '\n',
              )
            })
          }
        } else if (
          message.method === 'thread/start' &&
          typeof message.id === 'number'
        ) {
          respond(message.id, { threadId: 'fresh-thread' })
        }
      }

      newlineIndex = buffer.indexOf('\n')
    }
  })
}

describe('CodexProvider', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('recovers from a stale continuation thread by starting a fresh thread', async () => {
    const child = new MockChildProcess()
    createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'are you good?',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: 'dead-thread',
    })

    const transcript: TranscriptEntry[] = []
    const statuses: string[] = []
    const continuationTokens: string[] = []

    handle.onTranscriptEntry((entry) => {
      transcript.push(entry)
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

    expect(continuationTokens).toEqual(['dead-thread', 'fresh-thread'])
    expect(statuses).toContain('running')
    expect(statuses).not.toContain('failed')

    expect(transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'user',
          text: 'are you good?',
        }),
        expect.objectContaining({
          type: 'system',
          text: 'Codex thread was no longer available. Started a new thread; previous provider context may be missing.',
        }),
      ]),
    )
    expect(
      transcript.some(
        (entry) =>
          entry.type === 'system' &&
          entry.text.startsWith('Initialization failed:'),
      ),
    ).toBe(false)
  })
})
