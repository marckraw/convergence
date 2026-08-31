import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { describe, expect, it, vi } from 'vitest'
import { CodexAppServerClient } from './codex-app-server-client'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null
  killed = false

  kill = vi.fn(() => {
    this.killed = true
    return true
  })
}

/**
 * Answers `initialize` and `skills/list` and records every request the client
 * sent, so the handshake payload can be asserted.
 */
function createServer(child: MockChildProcess): {
  requests: Array<{ method: string; params?: Record<string, unknown> }>
} {
  const requests: Array<{
    method: string
    params?: Record<string, unknown>
  }> = []
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
          method?: string
          params?: Record<string, unknown>
        }

        if (typeof message.method === 'string') {
          requests.push({ method: message.method, params: message.params })
        }

        if (typeof message.id === 'number') {
          const result = message.method === 'skills/list' ? { skills: [] } : {}
          setTimeout(() => {
            child.stdout.write(
              JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n',
            )
          }, 0)
        }
      }

      newlineIndex = buffer.indexOf('\n')
    }
  })

  return { requests }
}

describe('CodexAppServerClient', () => {
  it('sends the real app version in the initialize handshake', async () => {
    const child = new MockChildProcess()
    const server = createServer(child)

    const client = new CodexAppServerClient('/usr/local/bin/codex', {
      spawnProcess: () => child as never,
      appVersion: '9.9.9',
    })

    await client.listSkills('/repo')

    const initialize = server.requests.find(
      (request) => request.method === 'initialize',
    )
    expect(initialize?.params).toMatchObject({
      clientInfo: {
        name: 'convergence',
        title: 'Convergence',
        version: '9.9.9',
      },
    })
  })

  it('falls back to the placeholder when no app version is supplied', async () => {
    const child = new MockChildProcess()
    const server = createServer(child)

    const client = new CodexAppServerClient('/usr/local/bin/codex', {
      spawnProcess: () => child as never,
    })

    await client.listSkills('/repo')

    const initialize = server.requests.find(
      (request) => request.method === 'initialize',
    )
    expect(initialize?.params).toMatchObject({
      clientInfo: { version: '0.0.0' },
    })
  })
})
