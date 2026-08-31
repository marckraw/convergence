import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({ spawn: spawnMock }))

import { PiProvider } from './pi-provider'

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

describe('PiProvider context management', () => {
  afterEach(() => spawnMock.mockReset())

  it('sends the native compact RPC command with optional instructions', async () => {
    const child = new MockChildProcess()
    const commands: Array<Record<string, unknown>> = []
    child.stdin.on('data', (chunk) => {
      const command = JSON.parse(chunk.toString().trim()) as Record<
        string,
        unknown
      >
      commands.push(command)
      setTimeout(() => {
        child.stdout.write(
          JSON.stringify({
            type: 'response',
            command: 'compact',
            id: command.id,
            success: true,
            data: {},
          }) + '\n',
        )
      }, 0)
    })
    spawnMock.mockReturnValue(child)
    const provider = new PiProvider('/usr/local/bin/pi')

    const result = await provider.manageContext?.(
      {
        sessionId: 'session-1',
        workingDirectory: '/repo',
        initialMessage: '',
        model: null,
        effort: null,
        continuationToken: '/tmp/pi-session.jsonl',
      },
      { kind: 'compact', instructions: 'Keep architecture decisions' },
    )

    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/local/bin/pi',
      ['--mode', 'rpc', '--session', '/tmp/pi-session.jsonl'],
      expect.objectContaining({ cwd: '/repo' }),
    )
    expect(commands[0]).toMatchObject({
      type: 'compact',
      customInstructions: 'Keep architecture decisions',
    })
    expect(result?.contextWindow.availability).toBe('unavailable')
  })
})
