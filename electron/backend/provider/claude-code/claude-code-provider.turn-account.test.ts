import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { ClaudeCodeProvider } from './claude-code-provider'
import type { ClaudeAccountLookup } from './claude-code-provider'

const ACCOUNT_A = {
  configDir: '/home/.convergence/provider-accounts/claude/acct-a',
  credentialDir: '/home/.convergence/provider-credentials/claude/acct-a',
}
const ACCOUNT_B = {
  configDir: '/home/.convergence/provider-accounts/claude/acct-b',
  credentialDir: '/home/.convergence/provider-credentials/claude/acct-b',
}

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  private exited = false

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    this.emitExit(0)
    return true
  })

  emitExit(code: number): void {
    if (this.exited) return
    this.exited = true
    this.emit('exit', code)
  }
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

function attachListeners(handle: {
  onDelta: (cb: (delta: unknown) => void) => void
  onStatusChange: (cb: () => void) => void
  onAttentionChange: (cb: () => void) => void
  onContinuationToken: (cb: () => void) => void
  onContextWindowChange: (cb: () => void) => void
  onActivityChange: (cb: () => void) => void
}) {
  handle.onStatusChange(() => {})
  handle.onAttentionChange(() => {})
  handle.onContinuationToken(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})
}

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('per-turn account attribution', () => {
  it('spawns a turn on the account the turn selected', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const lookup: ClaudeAccountLookup = (id) =>
      id === 'acct-a' ? ACCOUNT_A : null

    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      lookup,
    )
    const handle = provider.start({
      sessionId: 'session-account',
      workingDirectory: process.cwd(),
      initialMessage: 'hello',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
      providerAccountId: 'acct-a',
    })

    handle.onDelta(() => {})
    attachListeners(handle)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    expect(spawnedEnv(0).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_A.configDir)
    expect(spawnedEnv(0).CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
      ACCOUNT_A.credentialDir,
    )
  })

  it('resolves nothing when no account was selected', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    const handle = provider.start({
      sessionId: 'session-default',
      workingDirectory: process.cwd(),
      initialMessage: 'hello',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
    })

    handle.onDelta(() => {})
    attachListeners(handle)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    // Behaviour-neutral: the ambient default account, byte-identical to before.
    expect(spawnedEnv(0)).toEqual({ ...process.env })
  })

  /**
   * The lying case. A recovery restart continues work the user already asked
   * for. If the account were re-resolved at spawn time, a selection made
   * meanwhile would silently move that work to a different subscription — and
   * Claude's transcript records no account attribution to contradict it later.
   */
  it('restarts a recovered turn on the account that started it', async () => {
    const first = new MockChildProcess()
    const restarted = new MockChildProcess()
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(restarted)

    let selected = 'acct-a'
    const lookup: ClaudeAccountLookup = (id) => {
      if (id === undefined || id === null) return null
      return id === 'acct-a' ? ACCOUNT_A : ACCOUNT_B
    }

    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      (id) => lookup(id ?? selected),
    )
    const handle = provider.start({
      sessionId: 'session-recovery',
      workingDirectory: process.cwd(),
      initialMessage: 'do the long thing',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: 'stale-session-id',
      providerAccountId: 'acct-a',
    })

    handle.onDelta(() => {})
    attachListeners(handle)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    expect(spawnedEnv(0).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_A.configDir)

    // The user picks another account while the turn is still in flight.
    selected = 'acct-b'

    // Claude rejects the stale continuation token: it dies without producing
    // any turn output, and Convergence restarts the same turn without it.
    first.stderr.write('No conversation found with session ID\n')
    first.emitExit(1)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))

    expect(spawnedEnv(1).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_A.configDir)
    expect(spawnedEnv(1).CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(
      ACCOUNT_A.credentialDir,
    )
  })

  it('answers a deferred tool on the account that asked the question', async () => {
    const deferred = new MockChildProcess()
    const resumed = new MockChildProcess()
    spawnMock.mockReturnValueOnce(deferred).mockReturnValueOnce(resumed)

    let selected = 'acct-a'
    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      (id) => ((id ?? selected) === 'acct-a' ? ACCOUNT_A : ACCOUNT_B),
    )
    const handle = provider.start({
      sessionId: 'session-deferred-account',
      workingDirectory: process.cwd(),
      initialMessage: 'make a plan',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
      providerAccountId: 'acct-a',
    })

    const deferrals: unknown[] = []
    handle.onDelta((delta) => {
      if (
        delta.kind === 'conversation.item.add' &&
        delta.item.kind === 'input-request'
      ) {
        deferrals.push(delta.item)
      }
    })
    attachListeners(handle)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    deferred.stdout.write(
      `${JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-plan',
      })}\n`,
    )
    deferred.stdout.write(
      `${JSON.stringify({
        type: 'result',
        subtype: 'success',
        stop_reason: 'tool_deferred',
        session_id: 'claude-plan',
        deferred_tool_use: {
          id: 'toolu_plan',
          name: 'ExitPlanMode',
          input: { plan: '# Plan', allowedPrompts: [] },
        },
      })}\n`,
    )
    deferred.emitExit(0)

    await waitFor(() => expect(deferrals).toHaveLength(1))

    // The account picker moves while the plan card is open.
    selected = 'acct-b'

    handle.sendMessage('Approved plan', undefined, undefined, {
      deliveryMode: 'answer',
      interactionResponse: { kind: 'plan', decision: 'approve' },
      providerAccountId: 'acct-b',
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))

    expect(spawnedEnv(1).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_A.configDir)
  })

  it('starts the next turn on a newly selected account', async () => {
    const first = new MockChildProcess()
    const second = new MockChildProcess()
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second)

    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      (id) =>
        id === 'acct-a' ? ACCOUNT_A : id === 'acct-b' ? ACCOUNT_B : null,
    )
    const handle = provider.start({
      sessionId: 'session-switch',
      workingDirectory: process.cwd(),
      initialMessage: 'first',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
      providerAccountId: 'acct-a',
    })

    handle.onDelta(() => {})
    attachListeners(handle)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    first.stdout.write(
      `${JSON.stringify({ type: 'result', is_error: false, result: 'ok' })}\n`,
    )
    first.emitExit(0)

    handle.sendMessage('second', undefined, undefined, {
      deliveryMode: 'interrupt',
      providerAccountId: 'acct-b',
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))

    // A genuinely new logical turn honours the new selection.
    expect(spawnedEnv(1).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_B.configDir)
  })

  it('scopes a one-shot to the account the caller named', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider(
      '/usr/local/bin/claude',
      null,
      undefined,
      null,
      (id) => (id === 'acct-b' ? ACCOUNT_B : null),
    )
    const promise = provider.oneShot({
      prompt: 'name this session',
      modelId: 'sonnet',
      workingDirectory: process.cwd(),
      providerAccountId: 'acct-b',
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(Buffer.from('{"result":"ok"}'))
    child.stdout.end()
    child.emitExit(0)
    await promise

    expect(spawnedEnv(0).CLAUDE_CONFIG_DIR).toBe(ACCOUNT_B.configDir)
  })
})
