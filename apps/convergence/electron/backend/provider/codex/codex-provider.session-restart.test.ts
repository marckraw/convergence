import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import {
  CONTEXT_RESTARTED_NOTE_TEXT,
  SESSION_RESTARTED_EVENT_TYPE,
} from '../session-restart.pure'
import { CodexProvider } from './codex-provider'
import { CodexServerHostRegistry } from './codex-server-host'
import {
  FakeCodexChildProcess,
  FakeCodexServer,
  type FakeCodexServerOptions,
} from './codex-server-host.fixture'

const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

function session(
  autoCompleteTurns = true,
  initialMessage = 'before',
  options: FakeCodexServerOptions = {},
  continuationToken: string | null = null,
  connectReady: Promise<void> = Promise.resolve(),
) {
  const server = new FakeCodexServer({ autoCompleteTurns, ...options })
  const children: FakeCodexChildProcess[] = []
  const registry = new CodexServerHostRegistry({
    appVersion: 'test',
    cwd: '/tmp',
    spawnProcess: () => {
      const child = new FakeCodexChildProcess()
      children.push(child)
      setTimeout(() => child.announceListening('ws://127.0.0.1:5150'), 0)
      return child.asChildProcess()
    },
    probeReady: async () => true,
    connectTransport: async () => {
      await connectReady
      return server.connect()
    },
  })
  registry.setBinary('/usr/local/bin/codex', '0.153.4')
  const handle = new CodexProvider('/usr/local/bin/codex', registry).start({
    sessionId: 'same-session',
    workingDirectory: '/tmp',
    initialMessage,
    model: 'gpt-6',
    effort: 'high',
    continuationToken,
  })
  const deltas: SessionDelta[] = []
  const statuses: string[] = []
  const tokens: string[] = []
  handle.onDelta((delta) => deltas.push(delta))
  handle.onStatusChange((status) => statuses.push(status))
  handle.onContinuationToken((token) => tokens.push(token))
  cleanups.push(() => {
    handle.dispose?.()
    registry.stopAll()
  })
  return { server, children, handle, deltas, statuses, tokens }
}

function transcript(deltas: SessionDelta[]) {
  return deltas.flatMap((delta) =>
    delta.kind === 'conversation.item.add' ? [delta.item] : [],
  )
}

describe('Codex conversation reset', () => {
  it('starts a fresh thread and records the shared boundary — skip thread/start or forward /clear turns red', async () => {
    const bed = session()
    await vi.waitUntil(() => bed.statuses.at(-1) === 'completed')
    bed.handle.sendMessage('/clear')
    await vi.waitUntil(
      () =>
        bed.statuses.filter((status) => status === 'completed').length === 2,
    )
    bed.handle.sendMessage('after')
    await vi.waitUntil(
      () =>
        bed.statuses.filter((status) => status === 'completed').length === 3,
    )
    const items = transcript(bed.deltas)
    const turns = bed.server.requests.filter((r) => r.method === 'turn/start')
    expect({
      tokens: bed.tokens,
      boundaries: items.flatMap((item) =>
        item.kind === 'note' &&
        item.providerMeta.providerEventType === SESSION_RESTARTED_EVENT_TYPE
          ? [{ text: item.text, level: item.level }]
          : [],
      ),
      messages: items.flatMap((item) =>
        item.kind === 'message' && item.actor === 'user' ? [item.text] : [],
      ),
      turns: turns.map((r) => ({
        threadId: r.params?.threadId,
        model: r.params?.model,
        effort: r.params?.effort,
        input: r.params?.input,
      })),
      released: bed.server.requests
        .filter((r) => r.method === 'thread/unsubscribe')
        .map((r) => r.params?.threadId),
      connections: bed.server.connections.length,
      closed: bed.server.connections[0].closed,
      spawns: bed.children.length,
    }).toEqual({
      tokens: ['thread-1', 'thread-2'],
      boundaries: [{ text: CONTEXT_RESTARTED_NOTE_TEXT, level: 'warning' }],
      messages: ['before', 'after'],
      turns: [
        {
          threadId: 'thread-1',
          model: 'gpt-6',
          effort: 'high',
          input: [{ type: 'text', text: 'before', text_elements: [] }],
        },
        {
          threadId: 'thread-2',
          model: 'gpt-6',
          effort: 'high',
          input: [{ type: 'text', text: 'after', text_elements: [] }],
        },
      ],
      released: ['thread-1'],
      connections: 1,
      closed: false,
      spawns: 1,
    })
  })
  it('throws on a busy reset — return with a warning note turns red', async () => {
    const bed = session(false)
    await vi.waitUntil(
      () => bed.statuses.at(-1) === 'running' && bed.tokens.length === 1,
    )
    expect(() =>
      bed.handle.sendMessage('/clear', undefined, undefined, {
        deliveryMode: 'steer',
      }),
    ).toThrow(
      'Wait for the current turn to finish before clearing the conversation.',
    )
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect({
      messages: transcript(bed.deltas)
        .filter((item) => item.kind === 'message')
        .map((item) => item.text),
      refusal: transcript(bed.deltas)
        .filter((item) => item.kind === 'note')
        .map((item) => item.text)
        .filter((text) => text.includes('Wait for the current turn')),
      tokens: bed.tokens,
      status: bed.statuses.at(-1),
      steers: bed.server
        .methodsCalled()
        .filter((method) => method === 'turn/steer'),
    }).toEqual({
      messages: ['before'],
      refusal: [],
      tokens: ['thread-1'],
      status: 'running',
      steers: [],
    })
  })

  it('rejects a reset response without a new thread id — fall back to the old id turns red', async () => {
    const bed = session(true, 'before', {
      onRequest(message, _connection, server) {
        if (
          message.method === 'thread/start' &&
          server.methodsCalled().filter((method) => method === 'thread/start')
            .length === 2
        )
          return {}
      },
    })
    await vi.waitUntil(() => bed.statuses.at(-1) === 'completed')
    bed.handle.sendMessage('/clear')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect({
      status: bed.statuses.at(-1),
      tokens: bed.tokens,
      notes: transcript(bed.deltas).flatMap((item) =>
        item.kind === 'note' && item.level !== 'info' ? [item.text] : [],
      ),
      released: bed.server.requests.filter(
        (r) => r.method === 'thread/unsubscribe',
      ),
    }).toEqual({
      status: 'failed',
      tokens: ['thread-1'],
      notes: [
        'Could not clear the conversation: thread/start response did not include a thread id. The previous conversation is still active; your next message will resume it.',
      ],
      released: [],
    })
  })

  it.each(['/new', '/clear later'])(
    'keeps %s as prose — recognise slash prefixes as reset turns red',
    async (text) => {
      const bed = session()
      await vi.waitUntil(() => bed.statuses.at(-1) === 'completed')
      bed.handle.sendMessage(text)
      await vi.waitUntil(
        () =>
          bed.statuses.filter((status) => status === 'completed').length === 2,
      )
      expect({
        tokens: bed.tokens,
        messages: transcript(bed.deltas)
          .filter((item) => item.kind === 'message')
          .map((item) => item.text),
      }).toEqual({ tokens: ['thread-1'], messages: ['before', text] })
    },
  )

  it('handles an initial reset when the prior handle was released — forward initial /clear turns red', async () => {
    const bed = session(true, '/clear', {}, 'previous-thread')
    await vi.waitUntil(() => bed.statuses.at(-1) === 'completed')
    expect({
      tokens: bed.tokens,
      storedTokens: bed.deltas.flatMap((delta) =>
        delta.kind === 'session.patch' && delta.patch.continuationToken
          ? [delta.patch.continuationToken]
          : [],
      ),
      messages: transcript(bed.deltas).filter(
        (item) => item.kind === 'message',
      ),
      boundaries: transcript(bed.deltas).flatMap((item) =>
        item.kind === 'note' &&
        item.providerMeta.providerEventType === SESSION_RESTARTED_EVENT_TYPE
          ? [item.text]
          : [],
      ),
      resumed: bed.server.requests.filter((r) => r.method === 'thread/resume'),
      released: bed.server.requests
        .filter((r) => r.method === 'thread/unsubscribe')
        .map((r) => r.params?.threadId),
    }).toEqual({
      tokens: ['previous-thread', 'thread-1'],
      storedTokens: ['thread-1'],
      messages: [],
      boundaries: [CONTEXT_RESTARTED_NOTE_TEXT],
      resumed: [],
      released: ['previous-thread'],
    })
  })
  it('throws on reset while connecting — delete the connecting guard turns red', async () => {
    let release!: () => void
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })
    const bed = session(true, 'before', {}, null, ready)
    await vi.waitUntil(() => bed.children.length === 1)
    try {
      expect(() => bed.handle.sendMessage('/clear')).toThrow(
        'Wait for the current turn to finish before clearing the conversation.',
      )
    } finally {
      release()
      await vi.waitUntil(() => bed.statuses.at(-1) === 'completed')
    }
  })

  it('names a refused reset and keeps the old conversation — generic failure note or discard the old thread turns red', async () => {
    const bed = session(true, 'before', {
      onRequest(message, _connection, server) {
        if (
          message.method === 'thread/start' &&
          server.methodsCalled().filter((method) => method === 'thread/start')
            .length === 2
        )
          throw new Error('server refused reset')
      },
    })
    await vi.waitUntil(() => bed.statuses.at(-1) === 'completed')
    bed.handle.sendMessage('/clear')
    await vi.waitUntil(() => bed.statuses.at(-1) === 'failed')
    bed.handle.sendMessage('after')
    await vi.waitUntil(() => bed.statuses.at(-1) === 'completed')
    expect({
      tokens: bed.tokens,
      errors: transcript(bed.deltas).flatMap((item) =>
        item.kind === 'note' && item.level === 'error' ? [item.text] : [],
      ),
      turns: bed.server.requests
        .filter((r) => r.method === 'turn/start')
        .map((r) => r.params?.threadId),
    }).toEqual({
      tokens: ['thread-1'],
      errors: [
        'Could not clear the conversation: server refused reset. The previous conversation is still active; your next message will resume it.',
      ],
      turns: ['thread-1', 'thread-1'],
    })
  })
})
