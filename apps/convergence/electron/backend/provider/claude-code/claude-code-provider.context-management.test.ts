import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({ spawn: spawnMock }))

import { ClaudeCodeProvider } from './claude-code-provider'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false

  kill = vi.fn(() => {
    this.killed = true
    return true
  })
}

describe('ClaudeCodeProvider context management', () => {
  afterEach(() => spawnMock.mockReset())

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
})
