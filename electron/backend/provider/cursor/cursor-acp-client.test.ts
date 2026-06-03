import { EventEmitter } from 'events'
import { PassThrough, Writable } from 'stream'
import type { ChildProcess, SpawnOptions } from 'child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  buildCursorAcpInitializeParams,
  buildCursorAcpSessionParams,
  CursorAcpProcessClient,
  readCursorAcpSessionId,
  type CursorAcpSpawn,
} from './cursor-acp-client'

const SESSION_RESULT = {
  sessionId: 'cursor-session-1',
  configOptions: [
    {
      id: 'model',
      currentValue: 'default[]',
      options: [{ value: 'default[]', label: 'Auto' }],
    },
  ],
}

class FakeCursorAcpProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  stdin: Writable

  constructor(private onMessage: (message: Record<string, unknown>) => void) {
    super()
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        this.onMessage(JSON.parse(chunk.toString()))
        callback()
      },
    })
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.killed = true
    this.signalCode = signal ?? null
    return true
  }
}

function createSpawn(
  onMessage: (
    child: FakeCursorAcpProcess,
    message: Record<string, unknown>,
  ) => void,
) {
  const calls: Array<{
    binaryPath: string
    args: string[]
    options: SpawnOptions
  }> = []
  let child: FakeCursorAcpProcess | null = null
  const spawnProcess: CursorAcpSpawn = (binaryPath, args, options) => {
    child = new FakeCursorAcpProcess((message) => {
      if (!child) return
      onMessage(child, message)
    })
    calls.push({ binaryPath, args, options })
    return child as unknown as ChildProcess
  }

  return {
    calls,
    spawnProcess,
    get child() {
      return child
    },
  }
}

function respond(
  child: FakeCursorAcpProcess,
  message: Record<string, unknown>,
  result: unknown,
): void {
  child.stdout.write(
    JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n',
  )
}

describe('CursorAcpProcessClient', () => {
  it('builds Cursor ACP initialize and session payloads', () => {
    expect(buildCursorAcpInitializeParams()).toEqual({
      protocolVersion: 1,
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
      clientInfo: {
        name: 'convergence',
        version: '0.0.0',
      },
    })
    expect(buildCursorAcpSessionParams('/repo')).toEqual({
      cwd: '/repo',
      mcpServers: [],
    })
  })

  it('creates an authenticated disposable session for discovery', async () => {
    const methods: string[] = []
    const spawnHarness = createSpawn((child, message) => {
      methods.push(String(message.method))
      switch (message.method) {
        case 'initialize':
          respond(child, message, { protocolVersion: 1 })
          break
        case 'authenticate':
          respond(child, message, { authenticated: true })
          break
        case 'session/new':
          respond(child, message, SESSION_RESULT)
          break
      }
    })
    const client = new CursorAcpProcessClient('/usr/local/bin/agent', {
      spawnProcess: spawnHarness.spawnProcess,
    })

    const result = await client.createSession('/repo')

    expect(result).toEqual(SESSION_RESULT)
    expect(readCursorAcpSessionId(result)).toBe('cursor-session-1')
    expect(methods).toEqual(['initialize', 'authenticate', 'session/new'])
    expect(spawnHarness.calls[0]).toMatchObject({
      binaryPath: '/usr/local/bin/agent',
      args: ['acp'],
      options: {
        cwd: '/repo',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    })
    expect(spawnHarness.child?.killed).toBe(true)
  })

  it('supports continuation-related list and load calls', async () => {
    const methods: Array<{ method: string; params: unknown }> = []
    const spawnHarness = createSpawn((child, message) => {
      methods.push({ method: String(message.method), params: message.params })
      switch (message.method) {
        case 'initialize':
        case 'authenticate':
          respond(child, message, {})
          break
        case 'session/load':
          respond(child, message, { sessionId: 'session-42' })
          break
      }
    })
    const client = new CursorAcpProcessClient('agent', {
      spawnProcess: spawnHarness.spawnProcess,
    })

    const result = await client.loadSession('/repo', 'session-42')

    expect(result).toEqual({ sessionId: 'session-42' })
    expect(methods.at(-1)).toEqual({
      method: 'session/load',
      params: {
        sessionId: 'session-42',
        cwd: '/repo',
        mcpServers: [],
      },
    })
  })

  it('collects available command notifications during command discovery', async () => {
    const spawnHarness = createSpawn((child, message) => {
      switch (message.method) {
        case 'initialize':
        case 'authenticate':
          respond(child, message, {})
          break
        case 'session/new':
          child.stdout.write(
            JSON.stringify({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId: 'cursor-session-1',
                update: {
                  sessionUpdate: 'available_commands_update',
                  availableCommands: [
                    { name: 'review', description: 'Review changes' },
                  ],
                },
              },
            }) + '\n',
          )
          respond(child, message, SESSION_RESULT)
          break
      }
    })
    const client = new CursorAcpProcessClient('agent', {
      spawnProcess: spawnHarness.spawnProcess,
    })

    await expect(
      client.listAvailableCommands('/repo', { waitMs: 0 }),
    ).resolves.toEqual({
      session: SESSION_RESULT,
      notifications: [
        {
          method: 'session/update',
          params: {
            sessionId: 'cursor-session-1',
            update: {
              sessionUpdate: 'available_commands_update',
              availableCommands: [
                { name: 'review', description: 'Review changes' },
              ],
            },
          },
        },
      ],
    })
  })

  it('kills the ACP process when a request times out', async () => {
    vi.useFakeTimers()
    const spawnHarness = createSpawn(() => {
      // Leave requests unanswered.
    })
    const client = new CursorAcpProcessClient('agent', {
      spawnProcess: spawnHarness.spawnProcess,
      requestTimeoutMs: 25,
      operationTimeoutMs: 1000,
    })

    const resultPromise = client.createSession('/repo')
    const timeoutAssertion = expect(resultPromise).rejects.toThrow(
      'Timed out waiting for Cursor ACP initialize after 25ms',
    )
    await vi.advanceTimersByTimeAsync(25)

    await timeoutAssertion
    expect(spawnHarness.child?.killed).toBe(true)
    vi.useRealTimers()
  })

  it('rejects when the ACP process exits before discovery completes', async () => {
    const spawnHarness = createSpawn((child) => {
      child.stderr.write('boom')
      child.emit('exit', 42, null)
    })
    const client = new CursorAcpProcessClient('agent', {
      spawnProcess: spawnHarness.spawnProcess,
    })

    await expect(client.createSession('/repo')).rejects.toThrow(
      'Cursor ACP exited with code 42: boom',
    )
  })
})
