import { describe, expect, it } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import type { SessionHandle } from '../provider.types'
import { CodexProvider } from './codex-provider'
import { CodexServerHostRegistry } from './codex-server-host'
import {
  FAKE_CODEX_NO_RESPONSE,
  FakeCodexChildProcess,
  FakeCodexServer,
  type FakeCodexServerOptions,
} from './codex-server-host.fixture'

/**
 * The resident server, seen from the provider (MAR-2823).
 *
 * Every assertion here is one of the ticket's acceptance conditions: one
 * process for many sessions, a turn that pays no process start, a thread id
 * that is never adopted from a broadcast, and a turn that is reconciled rather
 * than resent after the connection dies under it.
 */
function createBed(
  options: FakeCodexServerOptions & { spawnDelayMs?: number } = {},
) {
  const { spawnDelayMs = 0, ...serverOptions } = options
  const server = new FakeCodexServer(serverOptions)
  const children: FakeCodexChildProcess[] = []

  const registry = new CodexServerHostRegistry({
    appVersion: '0.46.13',
    cwd: '/tmp',
    spawnProcess: () => {
      const child = new FakeCodexChildProcess()
      children.push(child)
      setTimeout(
        () => child.announceListening('ws://127.0.0.1:5150'),
        spawnDelayMs,
      )
      return child.asChildProcess()
    },
    probeReady: async () => true,
    connectTransport: async () => server.connect(),
  })
  registry.setBinary('/usr/local/bin/codex', '0.153.4')

  return {
    server,
    children,
    registry,
    provider: new CodexProvider('/usr/local/bin/codex', registry),
  }
}

function notes(handle: SessionHandle): string[] {
  const collected: string[] = []
  handle.onDelta((delta: SessionDelta) => {
    if (delta.kind === 'conversation.item.add' && delta.item.kind === 'note') {
      collected.push(delta.item.text)
    }
  })
  return collected
}

function attach(handle: SessionHandle): void {
  handle.onStatusChange(() => {})
  handle.onAttentionChange(() => {})
  handle.onContinuationToken(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})
}

function start(
  provider: CodexProvider,
  overrides: { sessionId: string; continuationToken?: string | null },
) {
  return provider.start({
    sessionId: overrides.sessionId,
    workingDirectory: process.cwd(),
    initialMessage: 'go',
    model: 'gpt-5.6-sol',
    effort: 'medium',
    continuationToken: overrides.continuationToken ?? null,
  })
}

function waitFor(assertion: () => void, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) return reject(error)
        setTimeout(attempt, 5)
      }
    }
    attempt()
  })
}

describe('one server, many sessions', () => {
  it('serves three sessions, quota and capability discovery from one process', async () => {
    const bed = createBed({ modelListResponse: { data: [] } })
    const handles = ['a', 'b', 'c'].map((id) => {
      const handle = start(bed.provider, { sessionId: `session-${id}` })
      attach(handle)
      return handle
    })

    await bed.provider.describe()
    await waitFor(() => {
      expect(
        bed.server.methodsCalled().filter((method) => method === 'turn/start'),
      ).toHaveLength(3)
    })

    expect(bed.children).toHaveLength(1)
    // One connection per session, plus the ambient one discovery used.
    expect(bed.server.connections.length).toBeGreaterThanOrEqual(4)
    handles.forEach((handle) => handle.dispose?.())
  })

  it('never adopts another session thread id from the broadcast', async () => {
    // `thread/started` reaches every connection, and a second session's
    // broadcast can arrive before this session's own response (measured on
    // 0.153.4). Routing is by thread id, never by "the latest one".
    const bed = createBed({ threadIdSequence: ['thread-a', 'thread-b'] })

    const first = start(bed.provider, { sessionId: 'session-a' })
    const firstTokens: string[] = []
    first.onContinuationToken((token) => firstTokens.push(token))
    attach(first)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })

    const second = start(bed.provider, { sessionId: 'session-b' })
    const secondTokens: string[] = []
    second.onContinuationToken((token) => secondTokens.push(token))
    attach(second)

    await waitFor(() => {
      expect(
        bed.server.methodsCalled().filter((method) => method === 'turn/start'),
      ).toHaveLength(2)
    })
    // Let every broadcast land.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(firstTokens).toEqual(['thread-a'])
    expect(secondTokens).toEqual(['thread-b'])

    const turnThreads = bed.server.requests
      .filter((request) => request.method === 'turn/start')
      .map((request) => request.params?.threadId)
    expect(turnThreads).toEqual(['thread-a', 'thread-b'])
  })

  it('keeps another session errors out of this session transcript', async () => {
    // Only `thread/started` and `thread/status/changed` are meant to broadcast,
    // but the filter is written by thread id rather than by method list: a
    // notification tagged with someone else's thread is never this session's
    // news, whatever it is called (constitution A2).
    const bed = createBed({ threadIdSequence: ['thread-a'] })
    const handle = start(bed.provider, { sessionId: 'session-a' })
    const collected = notes(handle)
    attach(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    })

    bed.server.connections[0].notify('error', {
      threadId: 'someone-elses-thread',
      error: { message: 'exceeded retry limit', willRetry: false },
    })
    bed.server.connections[0].notify('error', {
      threadId: 'thread-a',
      error: { message: 'ours to show', willRetry: true },
    })

    await waitFor(() => {
      expect(collected.some((note) => note.includes('ours to show'))).toBe(true)
    })
    expect(
      collected.some((note) => note.includes('exceeded retry limit')),
    ).toBe(false)
  })

  it('reaches turn/start on the second message without paying a process start', async () => {
    // A cold start here is 600ms of fake spawn — six times the budget this
    // asserts. If a turn ever pays one again, this goes red.
    const bed = createBed({ spawnDelayMs: 600 })
    const handle = start(bed.provider, { sessionId: 'session-warm' })
    attach(handle)

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    }, 4_000)

    const sentAt = Date.now()
    handle.sendMessage('second message')

    await waitFor(() => {
      expect(
        bed.server.methodsCalled().filter((method) => method === 'turn/start'),
      ).toHaveLength(2)
    })

    expect(Date.now() - sentAt).toBeLessThan(500)
    expect(bed.children).toHaveLength(1)
  })

  it('says it is starting up rather than looking dead during a cold start', async () => {
    const bed = createBed({ spawnDelayMs: 300 })
    const handle = start(bed.provider, { sessionId: 'session-cold' })
    const collected = notes(handle)
    attach(handle)

    await waitFor(() => {
      expect(
        collected.some((note) => note.includes('Codex is starting up')),
      ).toBe(true)
    })

    await waitFor(() => {
      expect(bed.server.methodsCalled()).toContain('turn/start')
    }, 4_000)
  })
})

describe('a turn that was sent but never acknowledged', () => {
  /**
   * The connection dies between `turn/start` leaving and its answer arriving.
   * Whether Codex ran the turn is a question with an answer on the server, so
   * recovery asks it (`thread/turns/list`, keyed by the `clientUserMessageId`
   * we sent) instead of resending blind.
   */
  function createRecoveryBed(options: { executed: boolean }) {
    let clientUserMessageId: string | null = null
    let dropped = false
    const server: FakeCodexServer = new FakeCodexServer({
      autoCompleteTurns: false,
      threadIdFactory: () => 'thread-1',
      turnsListResponse: () =>
        options.executed && clientUserMessageId
          ? {
              data: [
                {
                  id: 'turn-1',
                  items: [
                    { type: 'userMessage', clientId: clientUserMessageId },
                  ],
                },
              ],
              nextCursor: null,
            }
          : { data: [], nextCursor: null },
      onRequest: (message, connection) => {
        if (message.method !== 'turn/start') return undefined
        if (dropped) return undefined
        dropped = true
        clientUserMessageId = String(message.params?.clientUserMessageId ?? '')
        // The server took the turn and then the socket died before the ack.
        setTimeout(() => connection.fail('socket hang up'), 0)
        return FAKE_CODEX_NO_RESPONSE
      },
    })
    return { server, sentId: () => clientUserMessageId }
  }

  it('adopts a turn the server had already taken instead of sending it twice', async () => {
    const recovery = createRecoveryBed({ executed: true })
    const bed = createBed()
    // Swap in the reconciling server for this scenario.
    const registry = new CodexServerHostRegistry({
      appVersion: '0.46.13',
      cwd: '/tmp',
      spawnProcess: () => {
        const child = new FakeCodexChildProcess()
        bed.children.push(child)
        setTimeout(() => child.announceListening('ws://127.0.0.1:5150'), 0)
        return child.asChildProcess()
      },
      probeReady: async () => true,
      connectTransport: async () => recovery.server.connect(),
    })
    registry.setBinary('/usr/local/bin/codex', '0.153.4')
    const provider = new CodexProvider('/usr/local/bin/codex', registry)

    const handle = start(provider, { sessionId: 'session-recover' })
    const collected = notes(handle)
    attach(handle)

    await waitFor(() => {
      expect(recovery.server.methodsCalled()).toContain('thread/turns/list')
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(
      recovery.server.methodsCalled().filter((m) => m === 'turn/start'),
    ).toHaveLength(1)
    expect(
      collected.some((note) =>
        note.includes('Codex had already taken this message'),
      ),
    ).toBe(true)
  })

  it('resends the turn the server never took', async () => {
    const recovery = createRecoveryBed({ executed: false })
    const children: FakeCodexChildProcess[] = []
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
      connectTransport: async () => recovery.server.connect(),
    })
    registry.setBinary('/usr/local/bin/codex', '0.153.4')
    const provider = new CodexProvider('/usr/local/bin/codex', registry)

    const handle = start(provider, { sessionId: 'session-resend' })
    attach(handle)

    await waitFor(() => {
      expect(
        recovery.server.methodsCalled().filter((m) => m === 'turn/start'),
      ).toHaveLength(2)
    })

    const resent = recovery.server.requests.filter(
      (request) => request.method === 'turn/start',
    )
    // The same client id on both, so the server can recognise the retry.
    expect(resent[1].params?.clientUserMessageId).toBe(
      resent[0].params?.clientUserMessageId,
    )
  })
})
