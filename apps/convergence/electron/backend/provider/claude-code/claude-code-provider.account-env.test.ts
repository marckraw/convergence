import { EventEmitter } from 'events'
import { readFileSync } from 'fs'
import { PassThrough } from 'stream'
import { fileURLToPath } from 'url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { ClaudeCodeProvider } from './claude-code-provider'

const PROVIDER_SOURCE = fileURLToPath(
  new URL('./claude-code-provider.ts', import.meta.url),
)

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
        if (Date.now() - startedAt >= timeoutMs) {
          reject(error)
          return
        }
        setTimeout(attempt, 10)
      }
    }
    attempt()
  })
}

function spawnedEnv(call = 0): NodeJS.ProcessEnv {
  const options = spawnMock.mock.calls[call]?.[2] as
    | { env?: NodeJS.ProcessEnv }
    | undefined
  return options?.env ?? {}
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

/**
 * PA2's acceptance: every Claude process now passes through one environment
 * boundary, and with no account selected — which is every session today — the
 * environment that reaches the child is exactly the one it received before.
 */
describe('Claude spawn sites resolve their environment through one boundary', () => {
  it('routes every spawn in the provider through the resolver', () => {
    const source = stripComments(readFileSync(PROVIDER_SOURCE, 'utf8'))

    const spawns = source.match(/\bspawn\(/g) ?? []
    const resolves = source.match(/\bresolveClaudeAccountEnv\(/g) ?? []

    expect(spawns.length).toBeGreaterThan(0)
    expect(resolves.length).toBe(spawns.length)
    // No site may build its own environment: an inherited credential outranks
    // the selected account, and a second construction site is a second answer
    // to "which account served this turn".
    expect(source).not.toMatch(/\.\.\.process\.env/)
  })

  it('gives one-shots the same environment as before, plus nothing', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    const promise = provider.oneShot({
      prompt: 'name this session',
      modelId: 'sonnet',
      workingDirectory: process.cwd(),
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(Buffer.from('{"result":"ok"}'))
    child.stdout.end()
    child.emitExit(0)
    await promise

    expect(spawnedEnv()).toEqual({ ...process.env })
  })

  it('gives context compaction the same environment as before', async () => {
    const child = new MockChildProcess()
    child.stdin.on('data', () => {
      child.stdout.write(
        `${JSON.stringify({ type: 'system', hook_event_name: 'PreCompact' })}\n`,
      )
      child.stdout.write(
        `${JSON.stringify({ type: 'system', hook_event_name: 'PostCompact' })}\n`,
      )
      child.stdout.write(
        `${JSON.stringify({ type: 'result', is_error: false })}\n`,
      )
      setTimeout(() => child.emitExit(0), 0)
    })
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    await provider.manageContext(
      {
        sessionId: 'session-compact',
        workingDirectory: process.cwd(),
        initialMessage: '',
        model: null,
        effort: null,
        continuationToken: 'claude-session-id',
      },
      { kind: 'compact' },
    )

    expect(spawnedEnv()).toEqual({ ...process.env })
  })

  it('gives a session turn the same environment as before', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    const handle = provider.start({
      sessionId: 'session-env',
      workingDirectory: process.cwd(),
      initialMessage: 'hello',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
    })

    handle.onDelta(() => {})
    handle.onStatusChange(() => {})
    handle.onAttentionChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))

    expect(spawnedEnv()).toEqual({ ...process.env })
  })

  it('carries the deferred tool response into the turn that answers it', async () => {
    const deferredChild = new MockChildProcess()
    const resumedChild = new MockChildProcess()
    spawnMock
      .mockReturnValueOnce(deferredChild)
      .mockReturnValueOnce(resumedChild)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    const handle = provider.start({
      sessionId: 'session-deferred',
      workingDirectory: process.cwd(),
      initialMessage: 'ask me something',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: null,
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
    handle.onStatusChange(() => {})
    handle.onAttentionChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    deferredChild.stdout.write(
      `${JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-deferred',
      })}\n`,
    )
    deferredChild.stdout.write(
      `${JSON.stringify({
        type: 'result',
        subtype: 'success',
        stop_reason: 'tool_deferred',
        session_id: 'claude-session-deferred',
        deferred_tool_use: {
          id: 'toolu_plan',
          name: 'ExitPlanMode',
          input: { plan: '# Plan', allowedPrompts: [] },
        },
      })}\n`,
    )
    deferredChild.emitExit(0)

    await waitFor(() => expect(deferrals).toHaveLength(1))

    handle.sendMessage('Approved plan', undefined, undefined, {
      deliveryMode: 'answer',
      interactionResponse: { kind: 'plan', decision: 'approve' },
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2))

    const env = spawnedEnv(1)
    const deferredResponse = env.CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE
    expect(deferredResponse).toBeDefined()
    // The injection survives, and nothing else about the environment moved.
    expect(env).toEqual({
      ...process.env,
      CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE: deferredResponse,
    })
  })
})
