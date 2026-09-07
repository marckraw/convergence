import { describe, expect, it, vi } from 'vitest'
import type {
  AttentionState,
  SessionHandle,
  SessionStatus,
} from '../provider.types'
import { CodexProvider } from './codex-provider'
import { CodexServerHostRegistry } from './codex-server-host'
import {
  FAKE_CODEX_NO_RESPONSE,
  FakeCodexChildProcess,
  FakeCodexServer,
  type FakeCodexServerOptions,
} from './codex-server-host.fixture'
import { CODEX_RPC_BUDGETS_MS } from './jsonrpc'

/**
 * A Codex app-server that never runs.
 *
 * Everything in this suite is about what Convergence does when the real
 * app-server misbehaves — retries, stalls, dies mid-turn. Spawning the actual
 * `codex` binary would make those cases unreachable (and would touch the
 * enrolled accounts), so the process is a fake, and so is the socket to it.
 *
 * Since MAR-2823 the process is also *shared*: one resident server per
 * account, one connection per session. The scars this suite pins are the same,
 * but their shapes moved — a session recovers by reconnecting, not by
 * respawning, and nothing here may ever signal the process.
 */
function createStabilityBed(options: FakeCodexServerOptions = {}) {
  const server = new FakeCodexServer({
    threadIdFactory: () => 'thread-1',
    ...options,
  })
  const children: FakeCodexChildProcess[] = []
  let connectionCount = 0

  const registry = new CodexServerHostRegistry({
    appVersion: '0.46.13',
    cwd: '/tmp',
    spawnProcess: () => {
      const child = new FakeCodexChildProcess()
      children.push(child)
      setTimeout(() => child.announceListening('ws://127.0.0.1:5150'), 0)
      return child.asChildProcess()
    },
    probeReady: async () => true,
    connectTransport: async () => {
      connectionCount += 1
      return server.connect()
    },
  })
  registry.setBinary('/usr/local/bin/codex', '0.153.4')

  return {
    server,
    children,
    registry,
    provider: new CodexProvider(registry),
    connectionCount: () => connectionCount,
    /**
     * The server process dies, the way a crashed app-server would — sockets
     * first, exit second, which is the order that hides the obituary if the
     * session mourns the socket immediately.
     */
    killServer(code: number | null, stderr?: string) {
      const child = children[children.length - 1]
      if (stderr) child.log(stderr)
      server.connections.forEach((connection) => {
        if (!connection.closed) connection.fail('socket hang up')
      })
      child.exit(code)
    },
    /** Only this session's socket dies; the server lives on. */
    dropConnection() {
      server.connections[server.connections.length - 1]?.fail('socket hang up')
    },
    /** Server → the session's connection. */
    notify(method: string, params: unknown) {
      server.connections[server.connections.length - 1]?.notify(method, params)
    },
    pushServerRequest(id: number, method: string, params: unknown) {
      server.connections[server.connections.length - 1]?.push({
        jsonrpc: '2.0',
        id,
        method,
        params,
      })
    },
  }
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

describe('Codex transient errors (MAR-2315)', () => {
  it('keeps the session running through a reconnect notice and lets the turn finish', async () => {
    const bed = createStabilityBed()
    const server = bed.server
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methodsCalled()).toContain('turn/start')
    })

    bed.notify('error', { error: { message: 'Reconnecting... 2/5' } })
    bed.notify('turn/completed', { turn: { status: 'completed' } })

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
    const bed = createStabilityBed()
    const server = bed.server
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methodsCalled()).toContain('turn/start')
    })

    bed.notify('error', { message: 'something went sideways' })

    await waitFor(() => {
      expect(observed.notes).toContainEqual({
        text: 'Codex reported an error: something went sideways',
        level: 'warning',
      })
    })

    expect(observed.statuses).not.toContain('failed')
  })

  it('still fails the session on a fatal error followed by a crash', async () => {
    const bed = createStabilityBed()
    const server = bed.server
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methodsCalled()).toContain('turn/start')
    })

    bed.notify('error', {
      error: { message: 'exceeded retry limit, last status: 429' },
    })
    bed.killServer(1)

    await waitFor(() => {
      expect(observed.statuses).toContain('failed')
    })

    expect(observed.notes).toContainEqual({
      text: 'Error: exceeded retry limit, last status: 429',
      level: 'error',
    })
  })

  it('declines an elicitation mode it cannot render without failing the session', async () => {
    const bed = createStabilityBed()
    const server = bed.server
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(server.methodsCalled()).toContain('turn/start')
    })

    bed.pushServerRequest(900, 'mcpServer/elicitation/request', {
      mode: 'url',
      message: 'Open this',
    })

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
  it('gives up on a server that never answers and reconnects on the next message', async () => {
    vi.useFakeTimers()
    try {
      const bed = createStabilityBed({ silentMethods: ['initialize'] })
      const handle = startSession(bed.provider)
      const observed = observe(handle)

      // Let the connection open and the handshake go out unanswered.
      await vi.advanceTimersByTimeAsync(50)
      expect(bed.connectionCount()).toBe(1)
      // Warming up is a state, not a failure (MAR-2823, Build 4).
      expect(observed.notes.map((note) => note.level)).toEqual(['info'])

      await vi.advanceTimersByTimeAsync(CODEX_RPC_BUDGETS_MS.initialize + 500)

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

      expect(bed.connectionCount()).toBe(2)
      // The server itself was never signalled: it is the app's, not the
      // session's (MAR-2823).
      expect(bed.children[0].signals).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers from a dead socket instead of writing into it forever', async () => {
    const bed = createStabilityBed()
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })

    // The connection is gone but nobody told us — exactly what the missing
    // stream error handler used to leave behind.
    bed.dropConnection()

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
      expect(bed.connectionCount()).toBe(2)
    })
    await waitFor(() => {
      expect(
        bed.server.methodsCalled().filter((method) => method === 'turn/start'),
      ).toHaveLength(2)
    })
    // One server, throughout.
    expect(bed.children).toHaveLength(1)
  })

  it('ends the turn when the socket dies under it and the server lives on', async () => {
    // The socket dies mid-turn while the app-server is perfectly healthy, so
    // no process exit ever arrives to end the turn. Under the per-session
    // process this was masked — abandoning the connection killed the child and
    // its exit handler failed the turn — so a resident server reopened the
    // hole: the session sat at `running` forever and the app queued every
    // later message behind a turn that can never answer (MAR-2823).
    const bed = createStabilityBed({ autoCompleteTurns: false })
    const handle = startSession(bed.provider)
    const observed = observe(handle)
    const assistantStates = new Map<string, string | undefined>()
    handle.onDelta((delta) => {
      if (
        delta.kind === 'conversation.item.add' &&
        delta.item.kind === 'message' &&
        delta.item.actor === 'assistant'
      ) {
        assistantStates.set(delta.item.id, delta.item.state)
      }
      if (delta.kind === 'conversation.item.patch') {
        const patched = delta.patch as { state?: string }
        if (assistantStates.has(delta.itemId) && patched.state) {
          assistantStates.set(delta.itemId, patched.state)
        }
      }
    })

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })
    bed.notify('item/agentMessage/delta', { delta: 'half an ans' })
    await waitFor(() => {
      expect(assistantStates.size).toBe(1)
    })

    bed.dropConnection()

    await waitFor(() => {
      expect(
        observed.notes.some((note) =>
          note.text.includes('Lost the connection to the Codex app-server'),
        ),
      ).toBe(true)
    })

    // The server is alive and unsignalled: nothing but this path can end it.
    expect(bed.children[0].exitCode).toBeNull()
    expect(bed.children[0].signals).toEqual([])
    expect(observed.statuses.at(-1)).not.toBe('running')
    expect(observed.statuses).toContain('failed')
    expect(observed.attentions.at(-1)).toBe('failed')
    // What the model had already said is kept, and kept honestly: a partial
    // answer that stays `streaming` is a spinner nothing will ever stop.
    expect([...assistantStates.values()]).toEqual(['complete'])
  })

  it('fails fast when thread/start answers without a thread id', async () => {
    // A session's id comes only from its own `thread/start` result: its own
    // `thread/started` broadcast is dropped while `threadId` is still null
    // (the routing rule that stops it adopting a stranger's thread), so the
    // 60s waiter that used to stand here could never be satisfied. It spent
    // the whole budget and then failed with these very words — dead weight
    // that lied about what it was waiting for (MAR-2823). The MAR-2316 scar it
    // was built for — one waiter slot silently evicting another — went with
    // the waiter list itself; there is nothing left to evict.
    const bed = createStabilityBed({
      threadStartWithoutIdCount: 1,
      threadIdFactory: () => 'thread-late',
    })
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(
        observed.notes.some((note) =>
          note.text.includes(
            'thread/start response did not include a thread id',
          ),
        ),
      ).toBe(true)
    }, 1_000)
    expect(observed.statuses).toContain('failed')
    // Nothing was sent against a thread the session cannot name.
    expect(bed.server.methodsCalled()).not.toContain('turn/start')
  })

  it('waits out a cold start instead of giving up after a second', async () => {
    // Longer than the old 1000ms budget, far short of a cold start's 7–25s.
    const bed = createStabilityBed({ threadStartDelayMs: 1_200 })
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('thread/start')
    })

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    }, 4_000)

    expect(observed.statuses).not.toContain('failed')
  })
})

describe('Codex server death (MAR-2317, MAR-2823)', () => {
  it('resumes the thread on a fresh connection instead of starting a turn on it blind', async () => {
    const bed = createStabilityBed()
    const handle = startSession(bed.provider)
    observe(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })
    bed.notify('turn/completed', { turn: { status: 'completed' } })

    // The server dies. Under the per-turn model this was routine — every
    // completed turn released its own process; now it is news, and the thread
    // outlives it on disk.
    bed.killServer(0)

    handle.sendMessage('and one more thing')

    await waitFor(() => {
      expect(
        bed.server.methodsCalled().filter((method) => method === 'turn/start'),
      ).toHaveLength(2)
    })

    const methods = bed.server.methodsCalled()
    expect(methods.indexOf('thread/resume')).toBeGreaterThan(-1)
    expect(methods.indexOf('thread/resume')).toBeLessThan(
      methods.lastIndexOf('turn/start'),
    )
    // A second server, spawned lazily by the next message — never eagerly.
    expect(bed.children).toHaveLength(2)
  })

  it('quotes what the server said on its way out', async () => {
    const bed = createStabilityBed()
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })

    bed.killServer(1, "thread 'main' panicked at core/src/client.rs:412\n")

    await waitFor(() => {
      expect(
        observed.notes.some(
          (note) =>
            note.level === 'error' &&
            note.text.includes('exited with code 1') &&
            note.text.includes('core/src/client.rs:412'),
        ),
      ).toBe(true)
    })
  })

  it('fails honestly when the server ends cleanly mid-turn', async () => {
    const bed = createStabilityBed({ autoCompleteTurns: false })
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })

    bed.killServer(0)

    await waitFor(() => {
      expect(observed.statuses).toContain('failed')
    })
    expect(
      observed.notes.some((note) => note.text.includes('exited with code 0')),
    ).toBe(true)
  })

  it('says the server went away even with nothing in flight', async () => {
    // The old per-turn process exited after every completed turn, so silence
    // was correct. A *resident* server that exits on its own is always news:
    // the next message will pay a cold start, and the user is owed the reason.
    const bed = createStabilityBed()
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })
    bed.notify('turn/completed', { turn: { status: 'completed' } })
    await waitFor(() => {
      expect(observed.statuses).toContain('completed')
    })

    bed.killServer(0)
    await waitFor(() => {
      expect(
        observed.notes.some((note) => note.text.includes('exited with code 0')),
      ).toBe(true)
    })

    expect(observed.statuses).not.toContain('failed')
  })

  it('ends a pending approval with the connection instead of leaving it clickable forever', async () => {
    const bed = createStabilityBed()
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })

    bed.pushServerRequest(700, 'item/commandExecution/requestApproval', {
      command: 'rm -rf build',
    })

    await waitFor(() => {
      expect(observed.attentions).toContain('needs-approval')
    })

    bed.killServer(1)

    await waitFor(() => {
      expect(
        observed.notes.some((note) =>
          note.text.includes(
            'The Codex connection ended while it was waiting on you',
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

  it('interrupts the running turn on Stop instead of walking away from it', async () => {
    // Under the per-session process, Stop cancelled the turn by killing the
    // process it ran in. On a resident server nothing is killed and no signal
    // is permitted, so an unsent `turn/interrupt` means the model keeps working
    // — and keeps billing — after the UI has said stopped (MAR-2823 F1).
    const bed = createStabilityBed({ autoCompleteTurns: false })
    const handle = startSession(bed.provider)
    observe(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })

    handle.stop()
    // The session service releases the handle the moment `stop()` returns.
    handle.dispose?.()

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('thread/unsubscribe')
    })

    const methods = bed.server.methodsCalled()
    expect(methods).toContain('turn/interrupt')
    // Order is the assertion: unsubscribing first leaves the turn running on a
    // thread nobody is listening to.
    expect(methods.indexOf('turn/interrupt')).toBeLessThan(
      methods.indexOf('thread/unsubscribe'),
    )
    expect(
      bed.server.requests.find((request) => request.method === 'turn/interrupt')
        ?.params?.turnId,
    ).toBe('turn-1')
    // And still no signal, ever.
    expect(bed.children[0].signals).toEqual([])
  })

  it('waits for the acknowledgement so an unnamed turn can still be interrupted', async () => {
    // Stop can land between `turn/start` leaving and its answer arriving. The
    // turn is running; only the id we need to name it is late.
    const bed = createStabilityBed({
      autoCompleteTurns: false,
      onRequest: (message, connection) => {
        if (message.method !== 'turn/start') return undefined
        setTimeout(
          () =>
            connection.respond(message.id as number, {
              turn: { id: 'turn-late', status: 'inProgress' },
            }),
          60,
        )
        return FAKE_CODEX_NO_RESPONSE
      },
    })
    const handle = startSession(bed.provider)
    observe(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })

    handle.stop()
    handle.dispose?.()

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/interrupt')
    })
    expect(
      bed.server.requests.find((request) => request.method === 'turn/interrupt')
        ?.params?.turnId,
    ).toBe('turn-late')
  })

  it('never signals the server when a session fails or is released', async () => {
    const bed = createStabilityBed()
    const handle = startSession(bed.provider)
    observe(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })

    handle.stop()
    handle.dispose?.()

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('thread/unsubscribe')
    })
    expect(bed.children[0].signals).toEqual([])
    expect(bed.children[0].exitCode).toBeNull()
  })
})

describe('Codex single-flight thread start (MAR-2826)', () => {
  it('starts one thread when a second message arrives while thread/start is in flight', async () => {
    const bed = createStabilityBed({
      threadStartDelayMs: 30,
      threadIdFactory: (count) => `thread-${count}`,
    })
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() =>
      expect(bed.server.methodsCalled()).toContain('thread/start'),
    )
    handle.sendMessage('second')

    await waitFor(() =>
      expect(
        bed.server.requests.filter((r) => r.method === 'turn/start').length,
      ).toBe(2),
    )

    expect({
      starts: bed.server.methodsCalled().filter((m) => m === 'thread/start')
        .length,
      turnThreads: bed.server.requests
        .filter((r) => r.method === 'turn/start')
        .map((r) => r.params?.threadId),
      failures: observed.notes.filter((note) => note.level === 'error'),
    }).toEqual({
      starts: 1,
      turnThreads: ['thread-1', 'thread-1'],
      failures: [],
    })

    handle.dispose?.()
    bed.registry.stopAll()
  })

  it('starts one thread when a second message arrives while the turn-refused recovery is starting one', async () => {
    // The same shape as above, on the recovery path: the server refuses the
    // turn because the thread is gone, and the fresh thread that replaces it
    // used to be started around the single flight, so a message arriving in
    // that window minted a second one (MAR-2826 round 1, M1).
    const bed = createStabilityBed({
      threadStartDelayMs: 50,
      threadIdFactory: (count) => `thread-${count}`,
      onRequest: (message) => {
        if (
          message.method === 'turn/start' &&
          message.params?.threadId === 'thread-1'
        ) {
          throw new Error('no rollout found for thread id thread-1')
        }
        return undefined
      },
    })
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    // The recovery's own `thread/start` is on the wire (the fake records the
    // request before its delayed answer), which is the window this pins.
    await waitFor(() =>
      expect(
        bed.server.methodsCalled().filter((m) => m === 'thread/start').length,
      ).toBe(2),
    )
    handle.sendMessage('second')

    // Deliberately counts turns rather than the thread they name: three either
    // way, so the mutation reports the orphan it made instead of timing out.
    await waitFor(() =>
      expect(
        bed.server.requests.filter((r) => r.method === 'turn/start').length,
      ).toBe(3),
    )

    expect({
      starts: bed.server.methodsCalled().filter((m) => m === 'thread/start')
        .length,
      turnThreads: bed.server.requests
        .filter((r) => r.method === 'turn/start')
        .map((r) => r.params?.threadId),
      failures: observed.notes.filter((note) => note.level === 'error'),
    }).toEqual({
      starts: 2,
      turnThreads: ['thread-1', 'thread-2', 'thread-2'],
      failures: [],
    })

    handle.dispose?.()
    bed.registry.stopAll()
  })

  it('keeps a message sent during a reset on the reset’s own thread', async () => {
    // The reset started its thread around the single flight and never
    // published it, so a message arriving inside its `thread/start` window
    // resumed the OLD thread — and landed on the one the reset unsubscribed
    // two lines later (MAR-2826 round 1, M2).
    const bed = createStabilityBed({
      autoCompleteTurns: true,
      threadStartDelayMs: 50,
      threadIdFactory: (count) => `thread-${count}`,
    })
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() =>
      expect(
        bed.server.requests.filter((r) => r.method === 'turn/start').length,
      ).toBe(1),
    )
    handle.sendMessage('/clear')

    await waitFor(() =>
      expect(
        bed.server.methodsCalled().filter((m) => m === 'thread/start').length,
      ).toBe(2),
    )
    handle.sendMessage('after')

    await waitFor(() =>
      expect(
        bed.server.requests.filter((r) => r.method === 'turn/start').length,
      ).toBe(2),
    )

    expect({
      starts: bed.server.methodsCalled().filter((m) => m === 'thread/start')
        .length,
      turnThreads: bed.server.requests
        .filter((r) => r.method === 'turn/start')
        .map((r) => r.params?.threadId),
      // The thread the message rode must not be the one released underneath it.
      released: bed.server.requests
        .filter((r) => r.method === 'thread/unsubscribe')
        .map((r) => r.params?.threadId),
      failures: observed.notes.filter((note) => note.level === 'error'),
    }).toEqual({
      starts: 2,
      turnThreads: ['thread-1', 'thread-2'],
      released: ['thread-1'],
      failures: [],
    })

    handle.dispose?.()
    bed.registry.stopAll()
  })

  it('does not warn about lost context on the thread its own reset just opened', async () => {
    // The reset marks the thread it opens as having taken nothing, and that is
    // the fact `noteMissingThreadRecovery` reads when the server refuses a
    // turn on it. On a handle that survives its own `/clear` — no service, no
    // release, no new start config to carry the ledger's answer — this
    // in-session flag is the ONLY thing standing between a deliberate clear
    // and a warning that context was lost, and it was measured unpinned in
    // round 3 (MAR-2854; MAR-2826 round 2, L-a).
    const bed = createStabilityBed({
      autoCompleteTurns: true,
      threadIdFactory: (count) => `thread-${count}`,
      onRequest: (message) => {
        if (
          message.method === 'turn/start' &&
          message.params?.threadId === 'thread-2'
        ) {
          throw new Error('no rollout found for thread id thread-2')
        }
        return undefined
      },
    })
    const handle = startSession(bed.provider)
    const observed = observe(handle)

    await waitFor(() =>
      expect(
        bed.server.requests.filter((r) => r.method === 'turn/start').length,
      ).toBe(1),
    )
    handle.sendMessage('/clear')
    await waitFor(() =>
      expect(
        bed.server.requests.filter((r) => r.method === 'thread/unsubscribe')
          .length,
      ).toBe(1),
    )

    // The same handle carries the next message; the server refuses the turn on
    // the never-materialised thread the reset opened.
    handle.sendMessage('after')
    await waitFor(() =>
      expect(
        bed.server.requests.filter((r) => r.method === 'turn/start').length,
      ).toBe(3),
    )

    expect({
      turnThreads: bed.server.requests
        .filter((r) => r.method === 'turn/start')
        .map((r) => r.params?.threadId),
      recoveryNotes: observed.notes
        .map((note) => note.text)
        .filter((text) => text.includes('no longer available')),
    }).toEqual({
      turnThreads: ['thread-1', 'thread-2', 'thread-3'],
      recoveryNotes: [],
    })

    handle.dispose?.()
    bed.registry.stopAll()
  })

  it('re-subscribes a thread whose connection died while it was starting', async () => {
    // `thread/start` answers and the socket fails in the same synchronous
    // burst, so the awaiting continuation runs on a connection that is already
    // gone. The thread id survives that — the thread is the resident server's —
    // but the *subscription* does not, and a `turn/start` fired at a thread the
    // new connection never subscribed to streams to nobody: MAR-2317's shape,
    // reachable again through the resolution now in flight (MAR-2826).
    let failedOnce = false
    const bed = createStabilityBed({
      autoCompleteTurns: true,
      threadIdFactory: (count) => `thread-${count}`,
      onRequest: (message, connection, server) => {
        if (message.method !== 'thread/start' || failedOnce) return undefined
        failedOnce = true
        server.broadcast('thread/started', { thread: { id: 'thread-1' } })
        connection.respond(message.id as number, { thread: { id: 'thread-1' } })
        connection.fail('socket hang up')
        return FAKE_CODEX_NO_RESPONSE
      },
    })
    const handle = startSession(bed.provider)
    observe(handle)

    await waitFor(() =>
      expect(bed.server.methodsCalled()).toContain('thread/resume'),
    )

    expect({
      resumed: bed.server.requests
        .filter((r) => r.method === 'thread/resume')
        .map((r) => r.params?.threadId),
      // One thread, not two: the id outlives the connection even though the
      // readiness does not.
      starts: bed.server.methodsCalled().filter((m) => m === 'thread/start')
        .length,
    }).toEqual({ resumed: ['thread-1'], starts: 1 })

    handle.dispose?.()
    bed.registry.stopAll()
  })
})
