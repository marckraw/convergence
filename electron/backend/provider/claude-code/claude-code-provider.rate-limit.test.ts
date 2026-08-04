import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { ClaudeRateLimitState } from '../../provider-quota/claude-rate-limit.state'
import { ClaudeCodeProvider } from './claude-code-provider'
import type { ClaudeAccountLookup } from './claude-code-provider'
import type { SessionDelta } from '../../session/conversation-item.types'

const ACCOUNT_A = {
  configDir: '/home/.convergence/provider-accounts/claude/acct-a',
  credentialDir: '/home/.convergence/provider-credentials/claude/acct-a',
}

const lookup: ClaudeAccountLookup = (id) => (id === 'acct-a' ? ACCOUNT_A : null)

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

function startSession(options: {
  child: MockChildProcess
  rateLimits: ClaudeRateLimitState
  providerAccountId?: string | null
  deltas?: SessionDelta[]
}) {
  spawnMock.mockReturnValue(options.child)

  const provider = new ClaudeCodeProvider(
    '/usr/local/bin/claude',
    null,
    undefined,
    null,
    lookup,
    options.rateLimits,
  )
  const handle = provider.start({
    sessionId: 'session-rate-limit',
    workingDirectory: process.cwd(),
    initialMessage: 'hello',
    initialAttachments: undefined,
    model: null,
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

const RATE_LIMIT_EVENT = JSON.stringify({
  type: 'rate_limit_event',
  status: 'allowed_warning',
  rateLimitType: 'seven_day',
  resetsAt: '2099-08-09T00:00:00.000Z',
})

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('rate_limit_event', () => {
  /**
   * The whole point of PA8. This event used to be dropped on the floor, which
   * is how the app could sit at 98% of a weekly limit and have nothing to say.
   */
  it('files the provider limit reading against the turn account', async () => {
    const child = new MockChildProcess()
    const rateLimits = new ClaudeRateLimitState()
    startSession({ child, rateLimits, providerAccountId: 'acct-a' })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(`${RATE_LIMIT_EVENT}\n`)

    await waitFor(() =>
      expect(
        rateLimits.get({
          executionHostId: 'local',
          providerAccountId: 'acct-a',
        }),
      ).toMatchObject({
        providerAccountId: 'acct-a',
        status: 'allowed_warning',
        rateLimitType: 'seven_day',
        resetsAt: '2099-08-09T00:00:00.000Z',
      }),
    )
  })

  it('files a reading from an unselected turn under the ambient default', async () => {
    const child = new MockChildProcess()
    const rateLimits = new ClaudeRateLimitState()
    startSession({ child, rateLimits })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(`${RATE_LIMIT_EVENT}\n`)

    await waitFor(() =>
      expect(
        rateLimits.get({ executionHostId: 'local', providerAccountId: null })
          ?.status,
      ).toBe('allowed_warning'),
    )
    expect(
      rateLimits.get({ executionHostId: 'local', providerAccountId: 'acct-a' }),
    ).toBeNull()
  })

  it('does not render the event into the conversation', async () => {
    // Surfacing it in usage is the point; putting it in the transcript is not.
    const child = new MockChildProcess()
    const rateLimits = new ClaudeRateLimitState()
    const deltas: SessionDelta[] = []
    startSession({ child, rateLimits, providerAccountId: 'acct-a', deltas })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    const before = deltas.length
    child.stdout.write(`${RATE_LIMIT_EVENT}\n`)

    await waitFor(() =>
      expect(
        rateLimits.get({
          executionHostId: 'local',
          providerAccountId: 'acct-a',
        }),
      ).not.toBeNull(),
    )
    expect(deltas).toHaveLength(before)
  })

  it('ignores an event it cannot read rather than killing the session', async () => {
    const child = new MockChildProcess()
    const rateLimits = new ClaudeRateLimitState()
    startSession({ child, rateLimits, providerAccountId: 'acct-a' })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(
      `${JSON.stringify({ type: 'rate_limit_event', unexpected: true })}\n`,
    )
    child.stdout.write(`${RATE_LIMIT_EVENT}\n`)

    await waitFor(() =>
      expect(
        rateLimits.get({
          executionHostId: 'local',
          providerAccountId: 'acct-a',
        })?.status,
      ).toBe('allowed_warning'),
    )
  })
})
