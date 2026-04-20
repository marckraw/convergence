import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptEntry } from '../provider.types'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { ClaudeCodeProvider } from './claude-code-provider'

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
    if (this.exited) {
      return
    }
    this.exited = true
    this.emit('exit', code)
  }
}

function waitFor(
  assertion: () => void,
  timeoutMs = 400,
  intervalMs = 10,
): Promise<void> {
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

        setTimeout(attempt, intervalMs)
      }
    }

    attempt()
  })
}

describe('ClaudeCodeProvider continuation recovery', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('retries once without --resume when the stored Claude session is gone', async () => {
    const staleChild = new MockChildProcess()
    const recoveredChild = new MockChildProcess()

    spawnMock
      .mockReturnValueOnce(staleChild)
      .mockReturnValueOnce(recoveredChild)

    setTimeout(() => {
      staleChild.stderr.write('Session not found: stale-claude-session\n')
      staleChild.stderr.end()
    }, 0)

    setTimeout(() => {
      recoveredChild.stdout.write(
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          session_id: 'fresh-claude-session',
        }) + '\n',
      )
      recoveredChild.stdout.write(
        JSON.stringify({
          type: 'result',
          is_error: false,
          result: 'Recovered Claude reply',
        }) + '\n',
      )
      recoveredChild.emitExit(0)
    }, 20)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    const handle = provider.start({
      sessionId: 'session-claude',
      workingDirectory: process.cwd(),
      initialMessage: 'hello claude',
      initialAttachments: undefined,
      model: null,
      effort: null,
      continuationToken: 'stale-claude-session',
    })

    const transcript: TranscriptEntry[] = []
    const statuses: string[] = []
    const continuationTokens: string[] = []

    handle.onTranscriptEntry((entry) => {
      transcript.push(entry)
    })
    handle.onStatusChange((status) => {
      statuses.push(status)
    })
    handle.onContinuationToken((token) => {
      continuationTokens.push(token)
    })
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(spawnMock.mock.calls[0]?.[1]).toContain('--resume')
    expect(spawnMock.mock.calls[0]?.[1]).toContain('stale-claude-session')
    expect(spawnMock.mock.calls[1]?.[1]).not.toContain('--resume')
    expect(statuses).not.toContain('failed')
    expect(continuationTokens).toEqual([
      'stale-claude-session',
      'fresh-claude-session',
    ])

    const userEntries = transcript.filter((entry) => entry.type === 'user')
    expect(userEntries).toHaveLength(1)
    expect(userEntries[0]).toMatchObject({ text: 'hello claude' })
    expect(transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'system',
          text: 'Claude Code continuation was no longer available. Started a new session; previous provider context may be missing.',
        }),
        expect.objectContaining({
          type: 'assistant',
          text: 'Recovered Claude reply',
        }),
      ]),
    )
  })
})
