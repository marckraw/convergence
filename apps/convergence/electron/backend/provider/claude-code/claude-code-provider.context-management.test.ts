vi.mock('./claude-transport.service', async () => ({
  createClaudeTransport: (await import('./claude-transport.fixture'))
    .createFixtureClaudeTransport,
}))
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({ spawn: spawnMock }))

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
import { ClaudeAccountMaintenance } from './claude-account-maintenance.service'

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

describe('ClaudeCodeProvider context management', () => {
  afterEach(() => spawnMock.mockReset())

  it('bounds a timed-out compaction that ignores SIGTERM and releases its account on SIGKILL exit', async () => {
    vi.useFakeTimers()
    try {
      const child = new MockChildProcess()
      child.kill.mockImplementation((signal) => {
        if (signal === 'SIGKILL') child.emit('exit', null)
        return true
      })
      spawnMock.mockReturnValue(child)
      const gate = new ClaudeAccountMaintenance()
      const provider = new ClaudeCodeProvider(
        '/bin/claude',
        null,
        undefined,
        null,
        () => null,
        undefined,
        true,
        () => 0,
        gate,
      )
      const pending = provider.manageContext(
        {
          sessionId: 'fixture',
          workingDirectory: '/tmp',
          initialMessage: '',
          model: null,
          effort: null,
          continuationToken: 'thread',
          providerAccountId: 'acct-a',
        },
        { kind: 'compact' },
      )
      const failure = expect(pending).rejects.toThrow(/timed out/)
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled())
      await vi.advanceTimersByTimeAsync(120000)
      await failure
      await expect(gate.run('acct-a', async () => {})).rejects.toThrow(/active/)
      await vi.advanceTimersByTimeAsync(5000)
      expect(child.kill).toHaveBeenCalledWith('SIGKILL')
      await expect(gate.run('acct-a', async () => {})).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs /compact on the resumed headless session and verifies lifecycle events', async () => {
    const child = new MockChildProcess()
    let input = ''
    child.stdin.on('data', (chunk) => {
      input += chunk.toString()
      child.stdout.write(
        JSON.stringify({
          type: 'system',
          hook_event_name: 'PreCompact',
        }) + '\n',
      )
      child.stdout.write(
        JSON.stringify({
          type: 'system',
          hook_event_name: 'PostCompact',
        }) + '\n',
      )
      child.stdout.write(
        JSON.stringify({ type: 'result', is_error: false }) + '\n',
      )
      setTimeout(() => child.emit('exit', 0), 0)
    })
    spawnMock.mockReturnValue(child)
    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')

    const result = await provider.manageContext?.(
      {
        sessionId: 'session-1',
        workingDirectory: '/repo',
        initialMessage: '',
        model: 'sonnet',
        effort: 'medium',
        continuationToken: 'claude-session-1',
      },
      { kind: 'compact', instructions: 'Keep decisions' },
    )

    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      expect.arrayContaining(['--resume', 'claude-session-1']),
      expect.objectContaining({ cwd: '/repo' }),
    )
    expect(input).toContain('/compact Keep decisions')
    expect(result?.contextWindow.availability).toBe('unavailable')
  })

  it('records a debug note when the account config cannot be read safely (MAR-3030)', async () => {
    const child = new MockChildProcess()
    child.stdin.on('data', () => {
      child.stdout.write(
        JSON.stringify({
          type: 'system',
          hook_event_name: 'PreCompact',
        }) + '\n',
      )
      child.stdout.write(
        JSON.stringify({
          type: 'system',
          hook_event_name: 'PostCompact',
        }) + '\n',
      )
      child.stdout.write(
        JSON.stringify({ type: 'result', is_error: false }) + '\n',
      )
      setTimeout(() => child.emit('exit', 0), 0)
    })
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
      '/usr/local/bin/claude',
      null,
      debugSink,
      null,
      lookup,
    )

    await provider.manageContext?.(
      {
        sessionId: 'session-unreadable',
        workingDirectory: '/repo',
        initialMessage: '',
        model: 'sonnet',
        effort: 'medium',
        continuationToken: 'claude-session-1',
        providerAccountId: 'acct-unreadable',
      },
      { kind: 'compact', instructions: 'Keep decisions' },
    )

    const note = records.find((entry) => entry.channel === 'lifecycle')
    expect(note?.note).toContain(`${account.configDir}/.claude.json`)
    expect(note?.sessionId).toBe('session-unreadable')
  })
})
