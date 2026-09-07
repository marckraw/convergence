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
function createBed(options: FakeCodexServerOptions = {}) {
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
    connectTransport: async () => server.connect(),
  })
  registry.setBinary('/usr/local/bin/codex', '0.153.4')
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
    for (const call of spawnMock.mock.calls) {
      expect(call[1]).not.toContain('exec')
    }
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

  it('interrupts the turn it started when the budget runs out', async () => {
    const bed = createBed()
    const promise = bed.provider.oneShot({ ...NAMING, timeoutMs: 300 })

    await expect(promise).rejects.toThrow('codex oneShot timed out')
    const interrupt = requestParams(bed.server, 'turn/interrupt')
    expect(interrupt).toMatchObject({ turnId: 'turn-1' })
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
