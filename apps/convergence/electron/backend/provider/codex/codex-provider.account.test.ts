import { EventEmitter } from 'events'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Attachment } from '../provider.types'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CodexProvider } from './codex-provider'
import type { CodexAccountLookup } from './codex-provider'
import { CodexServerHostRegistry } from './codex-server-host'
import {
  FakeCodexServer,
  type FakeCodexServerOptions,
} from './codex-server-host.fixture'

const ACCOUNT_A = { configDir: '/home/.convergence/provider-accounts/codex/a' }
const ACCOUNT_B = { configDir: '/home/.convergence/provider-accounts/codex/b' }

const lookup: CodexAccountLookup = (id) =>
  id === 'acct-a' ? ACCOUNT_A : id === 'acct-b' ? ACCOUNT_B : null

/**
 * The account is now carried by the *server* a session connects to, one per
 * `CODEX_HOME` (MAR-2823). So these tests deliberately leave `spawnProcess`
 * alone and read the environment of the real spawn the host performs — the
 * same assertion as before, one layer down.
 */
class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null

  kill = vi.fn(() => {
    this.emit('exit', 0)
    return true
  })

  announceListening(): void {
    setTimeout(() => {
      this.stderr.write('  listening on: ws://127.0.0.1:5150\n')
    }, 0)
  }
}

function createRegistry(options: FakeCodexServerOptions = {}) {
  const server = new FakeCodexServer(options)
  const registry = new CodexServerHostRegistry({
    appVersion: '0.46.13',
    cwd: '/tmp',
    probeReady: async () => true,
    connectTransport: async () => server.connect(),
  })
  registry.setBinary('/usr/local/bin/codex', '0.153.4')
  return { registry, server }
}

function mockSpawnedServer(): MockChildProcess {
  const child = new MockChildProcess()
  spawnMock.mockImplementation(() => {
    child.announceListening()
    return child
  })
  return child
}

function waitFor(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) return reject(error)
        setTimeout(attempt, 10)
      }
    }
    attempt()
  })
}

function spawnedEnv(call: number): NodeJS.ProcessEnv {
  const options = spawnMock.mock.calls[call]?.[2] as
    | { env?: NodeJS.ProcessEnv }
    | undefined
  return options?.env ?? {}
}

function startSession(options: {
  providerAccountId?: string | null
  deltas?: SessionDelta[]
}) {
  const { registry } = createRegistry()
  const provider = new CodexProvider(registry, null, undefined, lookup)
  const handle = provider.start({
    sessionId: 'session-codex-account',
    workingDirectory: process.cwd(),
    initialMessage: 'hello',
    initialAttachments: undefined,
    model: 'gpt-5.4',
    effort: null,
    continuationToken: null,
    providerAccountId: options.providerAccountId ?? null,
  })

  handle.onDelta((delta) => options.deltas?.push(delta))
  handle.onStatusChange(() => {})
  handle.onAttentionChange(() => {})
  handle.onContinuationToken(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})

  return handle
}

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('Codex account isolation', () => {
  it('runs a session app-server under the account own CODEX_HOME', async () => {
    mockSpawnedServer()
    const deltas: SessionDelta[] = []
    startSession({ providerAccountId: 'acct-a', deltas })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    expect(spawnedEnv(0).CODEX_HOME).toBe(ACCOUNT_A.configDir)
    await waitFor(() =>
      expect(
        deltas.some(
          (delta) =>
            delta.kind === 'conversation.item.add' &&
            delta.item.kind === 'message' &&
            delta.item.actor === 'user' &&
            delta.providerAccountId === 'acct-a',
        ),
      ).toBe(true),
    )
  })

  it('leaves the environment untouched when no account is selected', async () => {
    mockSpawnedServer()
    const deltas: SessionDelta[] = []
    startSession({ deltas })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    // Behaviour-neutral: the ambient `~/.codex` login, byte-identical to before.
    expect(spawnedEnv(0)).toEqual({ ...process.env })
    await waitFor(() =>
      expect(
        deltas.some(
          (delta) =>
            delta.kind === 'conversation.item.add' &&
            delta.item.kind === 'message' &&
            delta.item.actor === 'user' &&
            delta.providerAccountId === null,
        ),
      ).toBe(true),
    )
  })

  it('keeps an inherited API key out of an account session', async () => {
    // OPENAI_API_KEY outranks the ChatGPT login, so inheriting it would bill a
    // different identity while the app claims to run the selected account.
    vi.stubEnv('OPENAI_API_KEY', 'sk-live')
    mockSpawnedServer()

    startSession({ providerAccountId: 'acct-a' })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    expect(spawnedEnv(0).OPENAI_API_KEY).toBeUndefined()
  })

  /**
   * The one-shot's account now decides which *server* answers it (MAR-2824):
   * the helper is an ephemeral thread on the resident app-server for that
   * account's `CODEX_HOME`, so the assertion moved one layer down — same
   * question, no `codex exec` child left to ask it of.
   */
  it('scopes a one-shot to the account the caller named', async () => {
    mockSpawnedServer()
    const { registry, server } = createRegistry()

    const provider = new CodexProvider(registry, null, undefined, lookup)
    const promise = provider.oneShot({
      prompt: 'name this session',
      modelId: 'gpt-5.4',
      workingDirectory: process.cwd(),
      providerAccountId: 'acct-b',
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    expect(spawnedEnv(0).CODEX_HOME).toBe(ACCOUNT_B.configDir)
    // The spawn is the app-server, never `codex exec`.
    expect(spawnMock.mock.calls[0][1]).toContain('app-server')
    expect(spawnMock.mock.calls[0][1]).not.toContain('exec')

    await waitFor(() => expect(server.methodsCalled()).toContain('turn/start'))
    const turn = server.requests.find((r) => r.method === 'turn/start')
    turn?.connection.notify('turn/completed', {
      threadId: turn.params?.threadId,
      turn: { id: 'turn-1', status: 'completed' },
    })
    await promise.catch(() => {})
  })

  /**
   * The honest edge, and sharper than before. The app-server is now resident
   * and *shared*: its credential belongs to the (host, account) key, not to
   * this session, so a mid-session switch cannot be served by respawning
   * anything. ADR 0007's "switching accounts mid-conversation needs no process
   * lifecycle management" is a property of Claude's per-turn spawn and does not
   * carry over — so the change is refused out loud instead of being silently
   * served by the account already running.
   */
  it('refuses a mid-session account change rather than silently serving the old one', async () => {
    mockSpawnedServer()
    const deltas: SessionDelta[] = []
    const handle = startSession({
      providerAccountId: 'acct-a',
      deltas,
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    const spawnsBefore = spawnMock.mock.calls.length

    const accepted = vi.fn()
    const disposition = await handle.sendMessage(
      'next turn',
      undefined,
      undefined,
      {
        deliveryMode: 'normal',
        providerAccountId: 'acct-b',
        onTurnAccepted: accepted,
      },
    )

    expect(disposition).toEqual({
      kind: 'refused',
      reason: expect.stringContaining('already running on the account'),
    })
    expect(accepted).not.toHaveBeenCalled()
    expect(spawnMock.mock.calls).toHaveLength(spawnsBefore)
  })

  it('accepts a turn that names the account the session is already on', async () => {
    mockSpawnedServer()
    const deltas: SessionDelta[] = []
    const handle = startSession({ providerAccountId: 'acct-a', deltas })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    handle.sendMessage('next turn', undefined, undefined, {
      deliveryMode: 'normal',
      providerAccountId: 'acct-a',
    })

    // No refusal note: this is the same account, so nothing is being claimed
    // that is not true.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(
      deltas.some(
        (delta) =>
          delta.kind === 'conversation.item.add' &&
          delta.item.kind === 'note' &&
          /already running on the account/.test(delta.item.text),
      ),
    ).toBe(false)
  })
})

it('a steer after a refused account change carries only its own account and attachment', async () => {
  mockSpawnedServer()
  const { registry, server } = createRegistry({ autoCompleteTurns: false })
  const provider = new CodexProvider(registry, null, undefined, lookup)
  const dir = mkdtempSync(join(tmpdir(), 'codex-steer-account-'))
  const attachment = (id: string): Attachment => {
    const storagePath = join(dir, id + '.txt')
    writeFileSync(storagePath, id)
    return {
      id,
      sessionId: 'refuse-steer',
      kind: 'text',
      mimeType: 'text/plain',
      filename: id + '.txt',
      sizeBytes: id.length,
      storagePath,
      thumbnailPath: null,
      textPreview: id,
      createdAt: '2026-01-01',
    }
  }
  const refusedAttachment = attachment('refused')
  const steerAttachment = attachment('steer')
  const deltas: SessionDelta[] = []
  const handle = provider.start({
    sessionId: 'refuse-steer',
    workingDirectory: dir,
    initialMessage: 'first',
    model: 'gpt-5.4',
    effort: null,
    continuationToken: null,
    providerAccountId: 'acct-a',
  })
  handle.onDelta((delta) => deltas.push(delta))
  handle.onStatusChange(() => {})
  handle.onAttentionChange(() => {})
  handle.onContinuationToken(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})
  try {
    await waitFor(() =>
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true),
    )
    expect(
      await handle.sendMessage('refused', [refusedAttachment], undefined, {
        deliveryMode: 'normal',
        providerAccountId: 'acct-b',
      }),
    ).toEqual({ kind: 'refused', reason: expect.any(String) })
    handle.sendMessage('steer', [steerAttachment], undefined, {
      deliveryMode: 'steer',
      providerAccountId: 'acct-a',
    })
    await waitFor(() =>
      expect(
        server.requests.some((request) => request.method === 'turn/steer'),
      ).toBe(true),
    )
    const users = deltas.flatMap((delta) =>
      delta.kind === 'conversation.item.add' &&
      delta.item.kind === 'message' &&
      delta.item.actor === 'user'
        ? [delta]
        : [],
    )
    expect(users).toHaveLength(2)
    expect(users[1]).toMatchObject({
      providerAccountId: 'acct-a',
      item: {
        text: 'steer',
        deliveryMode: 'steer',
        attachmentIds: ['steer'],
      },
    })
  } finally {
    await handle.stop()
    await registry.stopAll()
    rmSync(dir, { recursive: true, force: true })
  }
})
