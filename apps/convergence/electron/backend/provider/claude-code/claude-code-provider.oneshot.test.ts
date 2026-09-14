vi.mock('./claude-transport.service', async () => ({
  createClaudeTransport: (await import('./claude-transport.fixture'))
    .createFixtureClaudeTransport,
}))
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskProgressService } from '../../task-progress/task-progress.service'
import type { TaskProgressEvent } from '../../task-progress/task-progress.types'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

// A per-account `.claude.json` whose bytes are truncated mid-write — valid on
// disk, invalid JSON — so MAR-3030's "unreadable, not absent" branch is
// reachable without touching the real filesystem.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: async (
        ...args: Parameters<typeof actual.promises.readFile>
      ) => {
        if (args[0] === '/fixture/unreadable-account/.claude.json') {
          return '{"oauthAccount": {"emailAddress": "unreadable@example.com"'
        }
        return actual.promises.readFile(...args)
      },
    },
  }
})

import { ClaudeCodeProvider } from './claude-code-provider'
import type { ClaudeAccountLookup } from './claude-code-provider'
import type { ProviderDebugEntry } from '../../provider-debug/provider-debug.types'
import type { ProviderDebugSink } from '../../provider-debug/provider-debug-sink'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    return true
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

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('ClaudeCodeProvider.oneShot progress emission', () => {
  it('emits nothing when requestId is absent', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const broadcast = vi.fn()
    const service = new TaskProgressService(broadcast)
    const provider = new ClaudeCodeProvider('/bin/claude', service)

    const promise = provider.oneShot({
      prompt: 'hello',
      modelId: 'sonnet',
      workingDirectory: '/tmp',
    })

    // The environment now resolves through the account boundary before
    // spawning, so the child does not exist until that promise settles.
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled())

    child.stdout.write(Buffer.from('{"result":"ok"}'))
    child.stdout.end()
    child.emit('exit', 0)

    await promise
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('passes one-shot effort to Claude Code', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider('/bin/claude')

    const promise = provider.oneShot({
      prompt: 'hello',
      modelId: 'opus',
      effort: 'medium',
      workingDirectory: '/tmp',
    })

    // The environment now resolves through the account boundary before
    // spawning, so the child does not exist until that promise settles.
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled())

    child.stdout.write(Buffer.from('{"result":"ok"}'))
    child.stdout.end()
    child.emit('exit', 0)

    await promise
    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/claude',
      expect.arrayContaining(['--model', 'opus', '--effort', 'medium']),
      expect.objectContaining({
        cwd: '/tmp',
      }),
    )
  })

  it('emits started, stdout chunks, and settled:ok on success', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const provider = new ClaudeCodeProvider('/bin/claude', service)

    const promise = provider.oneShot({
      prompt: 'hello',
      modelId: 'sonnet',
      workingDirectory: '/tmp',
      requestId: 'req-success',
    })

    // The environment now resolves through the account boundary before
    // spawning, so the child does not exist until that promise settles.
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled())

    child.stdout.write(Buffer.from('{"resu'))
    child.stdout.write(Buffer.from('lt":"ok"}'))
    child.stdout.end()
    child.emit('exit', 0)

    const result = await promise
    expect(result.text).toBe('ok')

    const kinds = events.map((e) => e.kind)
    expect(kinds[0]).toBe('started')
    expect(kinds[kinds.length - 1]).toBe('settled')
    expect(kinds.filter((k) => k === 'stdout-chunk').length).toBe(2)

    const settled = events[events.length - 1]
    if (settled.kind !== 'settled') throw new Error('expected settled last')
    expect(settled.outcome).toBe('ok')
    expect(settled.requestId).toBe('req-success')
  })

  it('emits settled:error when the child exits non-zero', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const provider = new ClaudeCodeProvider('/bin/claude', service)

    const promise = provider.oneShot({
      prompt: 'hello',
      modelId: 'sonnet',
      workingDirectory: '/tmp',
      requestId: 'req-fail',
    })

    // The environment now resolves through the account boundary before
    // spawning, so the child does not exist until that promise settles.
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled())

    child.stderr.write(Buffer.from('boom'))
    child.stderr.end()
    child.emit('exit', 2)

    await expect(promise).rejects.toThrow(/exited with code 2/)

    const settled = events.find((e) => e.kind === 'settled')
    expect(settled).toBeDefined()
    if (settled?.kind !== 'settled') throw new Error('bad shape')
    expect(settled.outcome).toBe('error')

    expect(events.some((e) => e.kind === 'stderr-chunk')).toBe(true)
  })

  it('emits settled:timeout when the timeout fires before exit', async () => {
    vi.useFakeTimers()
    try {
      const child = new MockChildProcess()
      spawnMock.mockReturnValue(child)

      const service = new TaskProgressService(vi.fn())
      const events = captureEmits(service)
      const provider = new ClaudeCodeProvider('/bin/claude', service)

      const promise = provider.oneShot({
        prompt: 'hello',
        modelId: 'sonnet',
        workingDirectory: '/tmp',
        timeoutMs: 50,
        requestId: 'req-timeout',
      })
      promise.catch(() => {})

      await vi.advanceTimersByTimeAsync(60)

      await expect(promise).rejects.toThrow(/timed out/)
      const settled = events.find((e) => e.kind === 'settled')
      if (settled?.kind !== 'settled') throw new Error('bad shape')
      expect(settled.outcome).toBe('timeout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('records a debug note when the account config cannot be read safely (MAR-3030)', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const account = {
      configDir: '/fixture/unreadable-account',
      credentialDir: '/fixture/unreadable-account-credentials',
    }
    const lookup: ClaudeAccountLookup = (id) =>
      id === 'acct-unreadable' ? account : null
    const records: ProviderDebugEntry[] = []
    const debugSink: ProviderDebugSink = {
      record: (entry) => records.push(entry),
    }
    const provider = new ClaudeCodeProvider(
      '/bin/claude',
      null,
      debugSink,
      null,
      lookup,
    )

    const promise = provider.oneShot({
      prompt: 'hello',
      modelId: 'sonnet',
      workingDirectory: '/tmp',
      requestId: 'req-unreadable',
      providerAccountId: 'acct-unreadable',
    })

    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled())

    child.stdout.write(Buffer.from('{"result":"ok"}'))
    child.stdout.end()
    child.emit('exit', 0)

    await promise

    const note = records.find((entry) => entry.channel === 'lifecycle')
    expect(note?.note).toContain(`${account.configDir}/.claude.json`)
    expect(note?.sessionId).toBe('req-unreadable')
  })
})
