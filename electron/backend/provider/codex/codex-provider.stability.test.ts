import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AttentionState,
  SessionHandle,
  SessionStatus,
} from '../provider.types'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CodexProvider } from './codex-provider'
import { CODEX_RPC_BUDGETS_MS } from './jsonrpc'

/**
 * A Codex app-server that never runs.
 *
 * Everything in this suite is about what Convergence does when the real
 * app-server misbehaves — retries, stalls, dies mid-turn. Spawning the actual
 * `codex` binary would make those cases unreachable (and would touch the
 * enrolled accounts), so the process is a fake from stdio up.
 */
class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null

  kill = vi.fn(() => {
    this.killed = true
    return true
  })

  /** End the process the way a crashed app-server would. */
  exit(code: number | null): void {
    this.exitCode = code
    this.emit('exit', code)
  }
}

interface MockServer {
  requests: Array<{ method: string; params?: Record<string, unknown> }>
  responses: Array<{ id: string | number; result?: unknown; error?: unknown }>
  methods: () => string[]
}

function createMockCodexServer(
  child: MockChildProcess,
  options?: {
    /** Methods the server accepts but never answers. */
    silentMethods?: string[]
    threadId?: string
    /** Answer `thread/start` without an id, as a cold server does. */
    threadStartWithoutId?: boolean
  },
): MockServer {
  const silent = new Set(options?.silentMethods ?? [])
  const threadId = options?.threadId ?? 'thread-1'
  const requests: MockServer['requests'] = []
  const responses: MockServer['responses'] = []
  let buffer = ''

  const respond = (id: number, result: unknown) => {
    setTimeout(() => {
      child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
    }, 0)
  }

  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)

      if (line) {
        const message = JSON.parse(line) as {
          id?: string | number
          method?: string
          params?: Record<string, unknown>
          result?: unknown
          error?: unknown
        }

        if ('id' in message && !('method' in message)) {
          responses.push({
            id: message.id as string | number,
            result: message.result,
            error: message.error,
          })
        }

        if (
          typeof message.id === 'number' &&
          typeof message.method === 'string'
        ) {
          requests.push({ method: message.method, params: message.params })

          if (!silent.has(message.method)) {
            if (message.method === 'initialize') respond(message.id, {})
            else if (message.method === 'thread/start')
              respond(
                message.id,
                options?.threadStartWithoutId ? {} : { threadId },
              )
            else if (message.method === 'turn/steer') respond(message.id, {})
            else if (message.method === 'thread/resume')
              respond(message.id, {
                thread: { id: message.params?.threadId ?? threadId },
              })
            else if (message.method === 'turn/start') respond(message.id, {})
            else if (message.method === 'skills/list')
              respond(message.id, { skills: [] })
          }
        }
      }

      newlineIndex = buffer.indexOf('\n')
    }
  })

  return { requests, responses, methods: () => requests.map((r) => r.method) }
}

function waitFor(
  assertion: () => void,
  // Generous on purpose: these assertions are about what the adapter does, not
  // how fast it does it, and the suite shares a machine with ~300 others.
  timeoutMs = 2_000,
  intervalMs = 5,
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

interface Observed {
  statuses: SessionStatus[]
  attentions: AttentionState[]
  notes: Array<{ text: string; level: string }>
}

function observe(handle: SessionHandle): Observed {
  const observed: Observed = { statuses: [], attentions: [], notes: [] }

  handle.onDelta((delta) => {
    if (delta.kind === 'conversation.item.add' && delta.item.kind === 'note') {
      observed.notes.push({ text: delta.item.text, level: delta.item.level })
    }
  })
  handle.onStatusChange((status) => observed.statuses.push(status))
  handle.onAttentionChange((attention) => observed.attentions.push(attention))
  handle.onContinuationToken(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})

  return observed
}

function startSession(
  provider: CodexProvider,
  overrides?: { sessionId?: string; continuationToken?: string | null },
) {
  return provider.start({
    sessionId: overrides?.sessionId ?? 'session-stability',
    workingDirectory: process.cwd(),
    initialMessage: 'go',
    model: 'gpt-5.6-sol',
    effort: 'medium',
    continuationToken: overrides?.continuationToken ?? null,
  })
}

function notify(
  child: MockChildProcess,
  method: string,
  params: unknown,
): void {
  child.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('Codex transient errors (MAR-2315)', () => {
  it('keeps the session running through a reconnect notice and lets the turn finish', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methods()).toContain('turn/start')
    })

    notify(child, 'error', { error: { message: 'Reconnecting... 2/5' } })
    notify(child, 'turn/completed', { turn: { status: 'completed' } })

    await waitFor(() => {
      expect(observed.statuses).toContain('completed')
    })

    expect(observed.statuses).not.toContain('failed')
    expect(observed.attentions).not.toContain('failed')
    expect(observed.notes).toContainEqual({
      text: 'Codex hit a temporary problem and is retrying: Reconnecting... 2/5',
      level: 'warning',
    })
  })

  it('reports an unrecognised error without claiming a retry or failing the session', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methods()).toContain('turn/start')
    })

    notify(child, 'error', { message: 'something went sideways' })

    await waitFor(() => {
      expect(observed.notes).toContainEqual({
        text: 'Codex reported an error: something went sideways',
        level: 'warning',
      })
    })

    expect(observed.statuses).not.toContain('failed')
  })

  it('still fails the session on a fatal error followed by a crash', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methods()).toContain('turn/start')
    })

    notify(child, 'error', {
      error: { message: 'exceeded retry limit, last status: 429' },
    })
    child.exit(1)

    await waitFor(() => {
      expect(observed.statuses).toContain('failed')
    })

    expect(observed.notes).toContainEqual({
      text: 'Error: exceeded retry limit, last status: 429',
      level: 'error',
    })
  })

  it('declines an elicitation mode it cannot render without failing the session', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methods()).toContain('turn/start')
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 900,
        method: 'mcpServer/elicitation/request',
        params: { mode: 'url', message: 'Open this' },
      }) + '\n',
    )

    await waitFor(() => {
      expect(
        server.responses.some(
          (response) =>
            response.id === 900 &&
            (response.error as { code?: number })?.code === -32602,
        ),
      ).toBe(true)
    })

    expect(observed.statuses).not.toContain('failed')
    expect(observed.attentions).not.toContain('failed')
    expect(
      observed.notes.some(
        (note) => note.level === 'warning' && note.text.includes('url'),
      ),
    ).toBe(true)
  })
})

describe('Codex hangs and dead pipes (MAR-2316)', () => {
  it('gives up on a server that never answers and respawns on the next message', async () => {
    vi.useFakeTimers()
    try {
      const children = [new MockChildProcess(), new MockChildProcess()]
      children.forEach((child) =>
        createMockCodexServer(child, { silentMethods: ['initialize'] }),
      )
      let spawnCount = 0
      spawnMock.mockImplementation(() => children[spawnCount++])

      const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
      const observed = observe(handle)

      // Let the server spawn and the handshake go out unanswered.
      await vi.advanceTimersByTimeAsync(50)
      expect(spawnMock).toHaveBeenCalledTimes(1)
      expect(observed.notes).toEqual([])

      await vi.advanceTimersByTimeAsync(CODEX_RPC_BUDGETS_MS.initialize + 100)

      expect(
        observed.notes.some(
          (note) =>
            note.level === 'error' &&
            note.text.includes('Lost the connection to the Codex app-server') &&
            note.text.includes('initialize'),
        ),
      ).toBe(true)

      handle.sendMessage('try again')
      await vi.advanceTimersByTimeAsync(50)

      expect(spawnMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers from a dead stdin instead of writing into it forever', async () => {
    const children = [new MockChildProcess(), new MockChildProcess()]
    const servers = children.map((child) => createMockCodexServer(child))
    let spawnCount = 0
    spawnMock.mockImplementation(() => children[spawnCount++])

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    await waitFor(() => {
      expect(servers[0].methods()).toContain('turn/start')
    })

    // The app-server is gone but nobody told us — exactly what `child.on(
    // 'error')` used to leave behind.
    children[0].stdin.destroy()

    handle.sendMessage('are you there?')

    await waitFor(() => {
      expect(
        observed.notes.some((note) =>
          note.text.includes('Lost the connection to the Codex app-server'),
        ),
      ).toBe(true)
    })

    handle.sendMessage('try again')

    await waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(servers[1].methods()).toContain('turn/start')
    })
  })

  it('answers every waiter for the thread id, not just the last one', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, { threadStartWithoutId: true })
    spawnMock.mockReturnValue(child)

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    // Both the opening turn and the steer ask for a thread whose id only
    // arrives later. With one waiter slot the second call evicted the first,
    // whose promise then never settled.
    await waitFor(() => {
      expect(server.methods()).toContain('thread/start')
    })
    handle.sendMessage('and also this', undefined, undefined, {
      deliveryMode: 'steer',
      expectedProviderTurnId: 'codex-turn-1',
    })
    await waitFor(() => {
      expect(
        server.methods().filter((method) => method === 'thread/start'),
      ).toHaveLength(2)
    })

    notify(child, 'thread/started', { threadId: 'thread-late' })

    await waitFor(() => {
      expect(server.methods()).toContain('turn/start')
      expect(server.methods()).toContain('turn/steer')
    })

    expect(
      observed.notes.some((note) => note.text.includes('did not include')),
    ).toBe(false)
  })

  it('waits out a cold start instead of giving up after a second', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, { threadStartWithoutId: true })
    spawnMock.mockReturnValue(child)

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methods()).toContain('thread/start')
    })

    // Longer than the old 1000ms budget, far short of a cold start's 13–28s.
    await new Promise((resolve) => setTimeout(resolve, 1200))
    notify(child, 'thread/started', { threadId: 'thread-slow' })

    await waitFor(() => {
      expect(server.methods()).toContain('turn/start')
    })

    expect(observed.statuses).not.toContain('failed')
  })
})

describe('Codex process death (MAR-2317)', () => {
  it('resumes the thread on a fresh process instead of starting a turn on it blind', async () => {
    const children = [new MockChildProcess(), new MockChildProcess()]
    const servers = children.map((child) => createMockCodexServer(child))
    let spawnCount = 0
    spawnMock.mockImplementation(() => children[spawnCount++])

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    observe(handle)

    await waitFor(() => {
      expect(servers[0].methods()).toContain('turn/start')
    })
    notify(children[0], 'turn/completed', { turn: { status: 'completed' } })
    await waitFor(() => {
      expect(servers[0].methods()).toContain('turn/start')
    })

    // The turn is over and the app-server is released — the shape every
    // completed Codex turn takes today.
    children[0].exit(0)

    handle.sendMessage('and one more thing')

    await waitFor(() => {
      expect(servers[1].methods()).toContain('turn/start')
    })

    expect(servers[1].methods().indexOf('thread/resume')).toBeGreaterThan(-1)
    expect(servers[1].methods().indexOf('thread/resume')).toBeLessThan(
      servers[1].methods().indexOf('turn/start'),
    )
  })

  it('quotes what the process said on its way out', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methods()).toContain('turn/start')
    })

    child.stderr.write("thread 'main' panicked at core/src/client.rs:412\n")
    await waitFor(() => {
      expect(child.stderr.readableLength).toBe(0)
    })
    child.exit(1)

    await waitFor(() => {
      expect(
        observed.notes.some(
          (note) =>
            note.level === 'error' &&
            note.text.startsWith('Process exited with code 1:') &&
            note.text.includes('core/src/client.rs:412'),
        ),
      ).toBe(true)
    })
  })

  it('fails honestly when the process ends cleanly mid-turn', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methods()).toContain('turn/start')
    })

    child.exit(0)

    await waitFor(() => {
      expect(observed.statuses).toContain('failed')
    })
    expect(observed.notes).toContainEqual(
      expect.objectContaining({
        text: 'The Codex process ended before finishing the turn',
        level: 'error',
      }),
    )
  })

  it('stays quiet when the process ends cleanly with nothing in flight', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methods()).toContain('turn/start')
    })
    notify(child, 'turn/completed', { turn: { status: 'completed' } })
    await waitFor(() => {
      expect(observed.statuses).toContain('completed')
    })

    child.exit(0)
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(observed.statuses).not.toContain('failed')
    expect(observed.notes).toEqual([])
  })

  it('ends a pending approval with the process instead of leaving it clickable forever', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const handle = startSession(new CodexProvider('/usr/local/bin/codex'))
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methods()).toContain('turn/start')
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 700,
        method: 'item/commandExecution/requestApproval',
        params: { command: 'rm -rf build' },
      }) + '\n',
    )

    await waitFor(() => {
      expect(observed.attentions).toContain('needs-approval')
    })

    child.exit(1)

    await waitFor(() => {
      expect(
        observed.notes.some((note) =>
          note.text.includes(
            'The Codex process ended while it was waiting on you',
          ),
        ),
      ).toBe(true)
    })
    expect(observed.attentions.at(-1)).not.toBe('needs-approval')

    // The button is still on screen; clicking it must say something rather
    // than swallow the click.
    handle.approve?.('700')

    await waitFor(() => {
      expect(
        observed.notes.some((note) => note.text.includes('had nowhere to go')),
      ).toBe(true)
    })
  })
})
