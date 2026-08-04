import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CodexProvider } from './codex-provider'
import type { CodexAccountLookup } from './codex-provider'

const ACCOUNT_A = { configDir: '/home/.convergence/provider-accounts/codex/a' }
const ACCOUNT_B = { configDir: '/home/.convergence/provider-accounts/codex/b' }

const lookup: CodexAccountLookup = (id) =>
  id === 'acct-a' ? ACCOUNT_A : id === 'acct-b' ? ACCOUNT_B : null

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()

  kill = vi.fn(() => {
    this.emit('exit', 0)
    return true
  })
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
  const provider = new CodexProvider(
    '/usr/local/bin/codex',
    null,
    undefined,
    null,
    lookup,
  )
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
    spawnMock.mockReturnValue(new MockChildProcess())

    startSession({ providerAccountId: 'acct-a' })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    expect(spawnedEnv(0).CODEX_HOME).toBe(ACCOUNT_A.configDir)
  })

  it('leaves the environment untouched when no account is selected', async () => {
    spawnMock.mockReturnValue(new MockChildProcess())

    startSession({})

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    // Behaviour-neutral: the ambient `~/.codex` login, byte-identical to before.
    expect(spawnedEnv(0)).toEqual({ ...process.env })
  })

  it('keeps an inherited API key out of an account session', async () => {
    // OPENAI_API_KEY outranks the ChatGPT login, so inheriting it would bill a
    // different identity while the app claims to run the selected account.
    vi.stubEnv('OPENAI_API_KEY', 'sk-live')
    spawnMock.mockReturnValue(new MockChildProcess())

    startSession({ providerAccountId: 'acct-a' })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    expect(spawnedEnv(0).OPENAI_API_KEY).toBeUndefined()
  })

  it('scopes a one-shot to the account the caller named', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider(
      '/usr/local/bin/codex',
      null,
      undefined,
      null,
      lookup,
    )
    const promise = provider.oneShot({
      prompt: 'name this session',
      modelId: 'gpt-5.4',
      workingDirectory: process.cwd(),
      providerAccountId: 'acct-b',
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    expect(spawnedEnv(0).CODEX_HOME).toBe(ACCOUNT_B.configDir)

    child.stdout.end()
    child.emit('exit', 0)
    await promise.catch(() => {})
  })

  /**
   * The honest edge. Codex holds one long-lived `app-server` for the whole
   * session rather than spawning per turn, so its credential is fixed when that
   * process starts. ADR 0007's "switching accounts mid-conversation needs no
   * process lifecycle management" is a property of Claude's per-turn spawn and
   * does not carry over — so the change is refused out loud instead of being
   * silently served by the account already running.
   */
  it('refuses a mid-session account change rather than silently serving the old one', async () => {
    spawnMock.mockReturnValue(new MockChildProcess())
    const deltas: SessionDelta[] = []
    const handle = startSession({
      providerAccountId: 'acct-a',
      deltas,
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    const spawnsBefore = spawnMock.mock.calls.length

    handle.sendMessage('next turn', undefined, undefined, {
      deliveryMode: 'normal',
      providerAccountId: 'acct-b',
    })

    await waitFor(() =>
      expect(
        deltas.some(
          (delta) =>
            delta.kind === 'conversation.item.add' &&
            delta.item.kind === 'note' &&
            /already running on the account it started with/.test(
              delta.item.text,
            ),
        ),
      ).toBe(true),
    )
    expect(spawnMock.mock.calls).toHaveLength(spawnsBefore)
  })

  it('accepts a turn that names the account the session is already on', async () => {
    spawnMock.mockReturnValue(new MockChildProcess())
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
