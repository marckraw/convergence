import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskProgressService } from '../../task-progress/task-progress.service'
import type { TaskProgressEvent } from '../../task-progress/task-progress.types'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CodexProvider } from './codex-provider'
import { CodexServerHostRegistry } from './codex-server-host'
import {
  FakeCodexChildProcess,
  FakeCodexServer,
  type FakeCodexConnection,
  type FakeCodexServerOptions,
} from './codex-server-host.fixture'

/**
 * Naming and extraction on the resident server (MAR-2824).
 *
 * Every assertion here is one of the ticket's acceptance conditions: an
 * ephemeral thread, a least-privilege profile, one helper at a time per
 * account, an unchanged progress heartbeat, and a call that never reaches for
 * a process of its own.
 */
function createBed(
  options: FakeCodexServerOptions = {},
  {
    detectBinary = true,
    connectDelayMs = 0,
  }: { detectBinary?: boolean; connectDelayMs?: number } = {},
) {
  const server = new FakeCodexServer({ autoCompleteTurns: false, ...options })
  const registry = new CodexServerHostRegistry({
    appVersion: '0.46.17',
    cwd: '/tmp',
    spawnProcess: () => {
      const child = new FakeCodexChildProcess()
      setTimeout(() => child.announceListening('ws://127.0.0.1:5150'), 0)
      return child.asChildProcess()
    },
    probeReady: async () => true,
    connectTransport: async () => {
      if (connectDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, connectDelayMs))
      }
      return server.connect()
    },
  })
  if (detectBinary) registry.setBinary('/usr/local/bin/codex', '0.153.4')
  return { server, registry, provider: new CodexProvider(registry) }
}

/** Answers the helper's turn the way 0.153.4 does: deltas, item, completion. */
function answerTurn(
  connection: FakeCodexConnection,
  threadId: string,
  chunks: string[],
): void {
  for (const delta of chunks) {
    connection.notify('item/agentMessage/delta', { threadId, delta })
  }
  connection.notify('item/completed', {
    threadId,
    item: { type: 'agentMessage', text: chunks.join('') },
  })
  connection.notify('turn/completed', {
    threadId,
    turn: { id: 'turn-1', status: 'completed' },
  })
}

function requestParams(
  server: FakeCodexServer,
  method: string,
): Record<string, unknown> | undefined {
  return server.requests.find((request) => request.method === method)?.params
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

/**
 * `'pending'` unless the promise settles within `ms`.
 *
 * The shape an assertion takes when the claim is that nothing happened: a
 * helper that answered a stranger's turn resolves immediately, so the only
 * way to catch it is to wait and find the promise still open.
 */
function settlement(promise: Promise<unknown>, ms: number): Promise<string> {
  return Promise.race([
    promise.then(
      () => 'settled',
      () => 'settled',
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('pending'), ms)),
  ])
}

function captureEmits(service: TaskProgressService): TaskProgressEvent[] {
  const events: TaskProgressEvent[] = []
  const original = service.emit.bind(service)
  vi.spyOn(service, 'emit').mockImplementation((event: TaskProgressEvent) => {
    events.push(event)
    original(event)
  })
  return events
}

const NAMING = {
  prompt: 'name this session',
  modelId: 'gpt-5.6-luna',
  workingDirectory: '/tmp/project',
  providerAccountId: null,
}

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('CodexProvider.oneShot on the resident server', () => {
  it('runs the helper on an ephemeral thread and returns the final agent message', async () => {
    const bed = createBed()
    const promise = bed.provider.oneShot(NAMING)

    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    const threadId = String(requestParams(bed.server, 'turn/start')?.threadId)
    answerTurn(bed.server.connections[0], threadId, ['Reverse a ', 'string'])

    await expect(promise).resolves.toEqual({ text: 'Reverse a string' })
    // The flag the whole design rests on: without it the turn leaves a rollout
    // and a lost connection becomes a resume (R4).
    expect(requestParams(bed.server, 'thread/start')).toMatchObject({
      cwd: '/tmp/project',
      ephemeral: true,
    })
  })

  it('gives the helper a read-only sandbox and no approvals, whatever the session runs as', async () => {
    const bed = createBed()
    const promise = bed.provider.oneShot({
      ...NAMING,
      // The caller's own session is yolo; the helper still is not.
      permissionConfig: { preset: 'yolo' },
    })

    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    answerTurn(
      bed.server.connections[0],
      String(requestParams(bed.server, 'turn/start')?.threadId),
      ['ok'],
    )
    await promise

    expect(requestParams(bed.server, 'thread/start')).toMatchObject({
      approvalPolicy: 'never',
      sandbox: 'read-only',
    })
  })

  it('carries the caller model, effort, service tier and output schema onto turn/start', async () => {
    const bed = createBed()
    const outputSchema = {
      type: 'object',
      properties: { title: { type: 'string' } },
    }
    const promise = bed.provider.oneShot({
      ...NAMING,
      effort: 'medium',
      serviceTier: 'fast',
      outputSchema,
    })

    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    answerTurn(
      bed.server.connections[0],
      String(requestParams(bed.server, 'turn/start')?.threadId),
      ['{"title":"ok"}'],
    )

    await expect(promise).resolves.toEqual({ text: '{"title":"ok"}' })
    expect(requestParams(bed.server, 'turn/start')).toMatchObject({
      model: 'gpt-5.6-luna',
      effort: 'medium',
      serviceTier: 'fast',
      outputSchema,
      input: [{ type: 'text', text: 'name this session' }],
    })
  })

  it('never spawns a process of its own — the retired `codex exec` child', async () => {
    const bed = createBed()
    const promise = bed.provider.oneShot(NAMING)

    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    answerTurn(
      bed.server.connections[0],
      String(requestParams(bed.server, 'turn/start')?.threadId),
      ['ok'],
    )
    await promise

    // The registry's own spawner is injected in this bed, so the only way
    // `child_process.spawn` fires at all is a helper reaching for a child.
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('releases the thread and closes the connection when the answer is in hand', async () => {
    const bed = createBed()
    const promise = bed.provider.oneShot(NAMING)

    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    const threadId = String(requestParams(bed.server, 'turn/start')?.threadId)
    answerTurn(bed.server.connections[0], threadId, ['ok'])
    await promise

    expect(requestParams(bed.server, 'thread/unsubscribe')).toEqual({
      threadId,
    })
    expect(bed.server.connections[0].closed).toBe(true)
    // An ephemeral thread has no rollout, so there is nothing to resume — and
    // a helper that tried would be reading somebody else's thread.
    expect(bed.server.methodsCalled()).not.toContain('thread/resume')
  })

  it('serialises two helper calls on one account instead of opening a second turn', async () => {
    const bed = createBed()
    const first = bed.provider.oneShot(NAMING)
    const second = bed.provider.oneShot(NAMING)

    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    // The second call has not even started its thread while the first is open.
    expect(
      bed.server.methodsCalled().filter((m) => m === 'thread/start'),
    ).toHaveLength(1)

    answerTurn(
      bed.server.connections[0],
      String(requestParams(bed.server, 'turn/start')?.threadId),
      ['first'],
    )
    await expect(first).resolves.toEqual({ text: 'first' })

    await waitFor(() =>
      expect(
        bed.server.methodsCalled().filter((m) => m === 'turn/start'),
      ).toHaveLength(2),
    )
    const secondTurn = bed.server.requests.filter(
      (request) => request.method === 'turn/start',
    )[1]
    answerTurn(secondTurn.connection, String(secondTurn.params?.threadId), [
      'second',
    ])
    await expect(second).resolves.toEqual({ text: 'second' })
  })

  it('lets the next helper run after one fails', async () => {
    const bed = createBed()
    const failing = bed.provider.oneShot(NAMING)

    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    const connection = bed.server.connections[0]
    connection.notify('turn/completed', {
      threadId: String(requestParams(bed.server, 'turn/start')?.threadId),
      turn: { id: 'turn-1', status: 'failed', error: { message: 'no quota' } },
    })
    await expect(failing).rejects.toThrow(/no quota/)

    const next = bed.provider.oneShot(NAMING)
    await waitFor(() =>
      expect(
        bed.server.methodsCalled().filter((m) => m === 'turn/start'),
      ).toHaveLength(2),
    )
    const secondTurn = bed.server.requests.filter(
      (request) => request.method === 'turn/start',
    )[1]
    answerTurn(secondTurn.connection, String(secondTurn.params?.threadId), [
      'ok',
    ])
    await expect(next).resolves.toEqual({ text: 'ok' })
  })

  it('reports a lost connection as retryable and never resumes the thread', async () => {
    const bed = createBed()
    const promise = bed.provider.oneShot(NAMING)

    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    bed.server.connections[0].fail('socket closed')

    await expect(promise).rejects.toThrow(/can be retried/)
    expect(bed.server.methodsCalled()).not.toContain('thread/resume')
  })

  it('interrupts the turn, unsubscribes and closes when the budget runs out', async () => {
    const bed = createBed()
    const promise = bed.provider.oneShot({ ...NAMING, timeoutMs: 300 })

    await expect(promise).rejects.toThrow('codex oneShot timed out')
    const interrupt = requestParams(bed.server, 'turn/interrupt')
    expect(interrupt).toMatchObject({ turnId: 'turn-1' })
    // The thread and the socket are ours on a server every other session
    // shares; a failed exit that keeps them is a leak per naming call.
    expect(requestParams(bed.server, 'thread/unsubscribe')).toEqual({
      threadId: String(requestParams(bed.server, 'turn/start')?.threadId),
    })
    expect(bed.server.connections[0].closed).toBe(true)
  })

  it('unsubscribes and closes when the turn fails', async () => {
    const bed = createBed()
    const promise = bed.provider.oneShot(NAMING)

    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    const threadId = String(requestParams(bed.server, 'turn/start')?.threadId)
    bed.server.connections[0].notify('turn/completed', {
      threadId,
      turn: { id: 'turn-1', status: 'failed', error: { message: 'no quota' } },
    })
    await expect(promise).rejects.toThrow(/no quota/)

    expect(requestParams(bed.server, 'thread/unsubscribe')).toEqual({
      threadId,
    })
    expect(bed.server.connections[0].closed).toBe(true)
  })

  it('closes the connection when thread/start answers without a thread id', async () => {
    const bed = createBed({ threadStartWithoutIdCount: 1 })

    await expect(bed.provider.oneShot(NAMING)).rejects.toThrow(
      /returned no thread id/,
    )

    // Nothing was started, so there is nothing to unsubscribe from — but the
    // socket was opened and only this call can close it.
    expect(bed.server.methodsCalled()).not.toContain('thread/unsubscribe')
    expect(bed.server.connections[0].closed).toBe(true)
  })

  it('spends the budget on the whole call, so a stalled host never reaches the model', async () => {
    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const bed = createBed({ threadStartDelayMs: 500 })
    const provider = new CodexProvider(bed.registry, service)

    await expect(
      provider.oneShot({ ...NAMING, requestId: 'req-cold', timeoutMs: 300 }),
    ).rejects.toThrow('codex oneShot timed out')

    // `turn/start` is where the user's quota starts being spent. A budget that
    // only covers the turn lets a host that answered nothing for 20s still
    // send it, which is exactly what killing the child at 20s never did.
    expect(bed.server.methodsCalled()).not.toContain('turn/start')
    const settled = events.find((e) => e.kind === 'settled')
    if (settled?.kind !== 'settled') throw new Error('bad shape')
    expect(settled.outcome).toBe('timeout')
  })

  it('gives up on a host still connecting, and closes the socket that lands late', async () => {
    const bed = createBed({}, { connectDelayMs: 400 })

    await expect(
      bed.provider.oneShot({ ...NAMING, timeoutMs: 200 }),
    ).rejects.toThrow('codex oneShot timed out')

    expect(bed.server.methodsCalled()).not.toContain('thread/start')
    // The socket still lands after the call gave up, on a resident server that
    // outlives it — and this call is the only thing that ever held it.
    await waitFor(() => {
      expect(bed.server.connections).toHaveLength(1)
      expect(bed.server.connections[0].closed).toBe(true)
    })
  })

  it('interrupts a turn whose acknowledgement landed after the budget ran out', async () => {
    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    let settledBeforeInterrupt: boolean | null = null
    const bed = createBed({
      turnStartDelayMs: 500,
      turnId: 'turn-late',
      onRequest: (message) => {
        if (message.method === 'turn/interrupt') {
          settledBeforeInterrupt = events.some((e) => e.kind === 'settled')
        }
        return undefined
      },
    })
    const provider = new CodexProvider(bed.registry, service)

    await expect(
      provider.oneShot({ ...NAMING, requestId: 'req-late', timeoutMs: 300 }),
    ).rejects.toThrow('codex oneShot timed out')

    // The deadline fell after `turn/start` was written and before its answer,
    // so this call never learned the id of a turn that is running anyway.
    // Unsubscribing and closing stops the events, not the turn: only an
    // interrupt carrying that late id stops spending quota on the server every
    // other session shares.
    expect(requestParams(bed.server, 'turn/interrupt')).toEqual({
      threadId: String(requestParams(bed.server, 'turn/start')?.threadId),
      turnId: 'turn-late',
    })
    expect(bed.server.connections[0].closed).toBe(true)
    // Which interrupt this is, told apart on the wire: a call that WAS
    // acknowledged interrupts from the answer's catch, before it settles. This
    // one had already settled `timeout` and could only interrupt afterwards —
    // so a fixture that stopped delaying the acknowledgement fails here rather
    // than passing through the ordinary path.
    expect(settledBeforeInterrupt).toBe(true)
  })

  it('names a connection lost before the turn was acknowledged as retryable', async () => {
    const bed = createBed({ threadStartDelayMs: 500 })
    const promise = bed.provider.oneShot(NAMING)

    await waitFor(() =>
      expect(bed.server.methodsCalled()).toContain('thread/start'),
    )
    // The socket dies while `thread/start` is still in flight: the caller must
    // still learn this is retryable, not read a raw transport message.
    bed.server.connections[0].fail('socket closed')

    await expect(promise).rejects.toThrow(/can be retried/)
  })

  it('ignores another thread answering on the same connection', async () => {
    const bed = createBed()
    const promise = bed.provider.oneShot(NAMING)

    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    const threadId = String(requestParams(bed.server, 'turn/start')?.threadId)
    const connection = bed.server.connections[0]

    // A stranger's session, completing on the socket this helper shares.
    answerTurn(connection, 'stranger-thread', ['a name for another session'])
    await expect(settlement(promise, 50)).resolves.toBe('pending')

    answerTurn(connection, threadId, ['the real name'])
    await expect(promise).resolves.toEqual({ text: 'the real name' })
  })

  it('refuses a server request mid-turn instead of leaving the turn hanging', async () => {
    const bed = createBed({
      onRequest: (message, connection) => {
        if (message.method !== 'turn/start') return undefined
        const threadId = String(message.params?.threadId)
        // What 0.153.4 does when a turn wants a command approved.
        setTimeout(() =>
          connection.push({
            jsonrpc: '2.0',
            id: 'approval-1',
            method: 'item/commandExecution/requestApproval',
            params: { threadId },
          }),
        )
        return undefined
      },
    })
    const promise = bed.provider.oneShot(NAMING)

    await waitFor(() =>
      expect(bed.server.responses.map((response) => response.id)).toContain(
        'approval-1',
      ),
    )
    expect(
      bed.server.responses.find((response) => response.id === 'approval-1')
        ?.error,
    ).toMatchObject({ code: -32601 })

    // Refused, not ignored: the turn goes on and still answers.
    answerTurn(
      bed.server.connections[0],
      String(requestParams(bed.server, 'turn/start')?.threadId),
      ['ok'],
    )
    await expect(promise).resolves.toEqual({ text: 'ok' })
  })

  it('refuses a caller that never stated which account it spends', async () => {
    const bed = createBed()
    await expect(
      bed.provider.oneShot({
        prompt: 'name this session',
        modelId: 'gpt-5.6-luna',
        workingDirectory: '/tmp/project',
      }),
    ).rejects.toThrow(/requires providerAccountId/)
    expect(bed.server.methodsCalled()).not.toContain('thread/start')
  })

  it('refuses a caller that spread the account key without filling it', async () => {
    const bed = createBed()
    // The key is present and says nothing: an optional field a caller never
    // filled would otherwise be served on whichever login is ambient.
    await expect(
      bed.provider.oneShot({ ...NAMING, providerAccountId: undefined }),
    ).rejects.toThrow(/requires providerAccountId/)
    expect(bed.server.methodsCalled()).not.toContain('thread/start')
  })

  it('refuses the omitted account before it resolves a host for it', async () => {
    // No binary detected: resolving a host throws first, so a provider that
    // refuses late reports "Codex CLI was not detected" for a call whose real
    // fault is that nobody said whose subscription it spends.
    const bed = createBed({}, { detectBinary: false })

    await expect(
      bed.provider.oneShot({
        prompt: 'name this session',
        modelId: 'gpt-5.6-luna',
        workingDirectory: '/tmp/project',
      }),
    ).rejects.toThrow(/requires providerAccountId/)
  })
})

describe('CodexProvider.oneShot progress emission', () => {
  it('emits nothing when requestId is absent', async () => {
    const broadcast = vi.fn()
    const service = new TaskProgressService(broadcast)
    const bed = createBed()
    const provider = new CodexProvider(bed.registry, service)

    const promise = provider.oneShot(NAMING)
    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    answerTurn(
      bed.server.connections[0],
      String(requestParams(bed.server, 'turn/start')?.threadId),
      ['hello world'],
    )
    await promise

    expect(broadcast).not.toHaveBeenCalled()
  })

  it('emits started, chunks, and settled:ok on success', async () => {
    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const bed = createBed()
    const provider = new CodexProvider(bed.registry, service)

    const promise = provider.oneShot({ ...NAMING, requestId: 'req-ok' })
    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    answerTurn(
      bed.server.connections[0],
      String(requestParams(bed.server, 'turn/start')?.threadId),
      ['partial ', 'output'],
    )
    await promise

    const kinds = events.map((e) => e.kind)
    expect(kinds[0]).toBe('started')
    expect(kinds.filter((k) => k === 'stdout-chunk').length).toBe(2)
    const settled = events[events.length - 1]
    if (settled.kind !== 'settled') throw new Error('expected settled last')
    expect(settled.outcome).toBe('ok')
  })

  it('emits settled:error when the turn fails', async () => {
    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const bed = createBed()
    const provider = new CodexProvider(bed.registry, service)

    const promise = provider.oneShot({ ...NAMING, requestId: 'req-err' })
    await waitFor(() =>
      expect(requestParams(bed.server, 'turn/start')).toBeDefined(),
    )
    bed.server.connections[0].notify('turn/completed', {
      threadId: String(requestParams(bed.server, 'turn/start')?.threadId),
      turn: { id: 'turn-1', status: 'failed', error: { message: 'boom' } },
    })
    await expect(promise).rejects.toThrow(/boom/)

    const settled = events.find((e) => e.kind === 'settled')
    if (settled?.kind !== 'settled') throw new Error('bad shape')
    expect(settled.outcome).toBe('error')
  })

  it('emits settled:timeout when the budget runs out', async () => {
    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const bed = createBed()
    const provider = new CodexProvider(bed.registry, service)

    await expect(
      provider.oneShot({ ...NAMING, requestId: 'req-slow', timeoutMs: 300 }),
    ).rejects.toThrow('codex oneShot timed out')

    const settled = events.find((e) => e.kind === 'settled')
    if (settled?.kind !== 'settled') throw new Error('bad shape')
    expect(settled.outcome).toBe('timeout')
  })
})
