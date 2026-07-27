import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { PiProvider } from './pi-provider'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    this.emit('exit', 0)
    return true
  })
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

/**
 * Answers the `prompt` handshake and then hands control of the event stream to
 * the test, so each case can replay an exact pi tape.
 */
function createPiEventServer(child: MockChildProcess): {
  emit: (event: Record<string, unknown>) => void
  promptCount: () => number
} {
  let buffer = ''
  let prompts = 0

  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)

      if (line) {
        const message = JSON.parse(line) as { id?: number; type?: string }
        if (message.type === 'prompt' || message.type === 'follow_up') {
          if (message.type === 'prompt') prompts += 1
          setTimeout(() => {
            child.stdout.write(
              JSON.stringify({
                type: 'response',
                command: message.type,
                id: message.id,
                success: true,
              }) + '\n',
            )
          }, 0)
        }
      }

      newlineIndex = buffer.indexOf('\n')
    }
  })

  return {
    emit: (event) => {
      child.stdout.write(JSON.stringify(event) + '\n')
    },
    promptCount: () => prompts,
  }
}

function startSession(): {
  statuses: string[]
  attentions: string[]
  items: Array<Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']>
} {
  const provider = new PiProvider('/usr/local/bin/pi')
  const handle = provider.start({
    sessionId: 'session-1',
    workingDirectory: process.cwd(),
    initialMessage: 'do the thing',
    initialAttachments: undefined,
    model: 'anthropic/claude-opus-5',
    effort: 'medium',
    continuationToken: null,
  })

  const statuses: string[] = []
  const attentions: string[] = []
  const items: Array<
    Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
  > = []

  handle.onDelta((delta) => {
    if (delta.kind === 'conversation.item.add') {
      items.push(delta.item)
    }
  })
  handle.onStatusChange((status) => statuses.push(status))
  handle.onAttentionChange((attention) => attentions.push(attention))
  handle.onContinuationToken(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})

  return { statuses, attentions, items }
}

describe('PiProvider settled semantics', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('does not settle on agent_end when pi is about to retry', async () => {
    const child = new MockChildProcess()
    const server = createPiEventServer(child)
    spawnMock.mockReturnValue(child)

    const { statuses, attentions } = startSession()

    await waitFor(() => {
      expect(server.promptCount()).toBe(1)
    })

    server.emit({ type: 'agent_start' })
    server.emit({
      type: 'agent_end',
      willRetry: true,
      messages: [{ role: 'assistant', stopReason: 'error' }],
    })
    server.emit({
      type: 'auto_retry_start',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 100,
      errorMessage: 'overloaded',
    })

    await waitFor(() => {
      expect(statuses).toContain('running')
    })

    // The run is still going: pi said it will retry, so nothing has settled.
    expect(statuses).not.toContain('completed')
    expect(statuses).not.toContain('failed')
    expect(attentions).not.toContain('finished')
    expect(attentions).not.toContain('failed')
  })

  it('does not settle on agent_end when an overflow compaction re-prompts', async () => {
    const child = new MockChildProcess()
    const server = createPiEventServer(child)
    spawnMock.mockReturnValue(child)

    const { statuses, attentions } = startSession()

    await waitFor(() => {
      expect(server.promptCount()).toBe(1)
    })

    server.emit({ type: 'agent_start' })
    server.emit({
      type: 'agent_end',
      willRetry: true,
      messages: [{ role: 'assistant', stopReason: 'stop' }],
    })
    server.emit({
      type: 'compaction_end',
      reason: 'overflow',
      result: undefined,
      aborted: false,
      willRetry: true,
    })

    await waitFor(() => {
      expect(statuses).toContain('running')
    })

    expect(statuses).not.toContain('completed')
    expect(attentions).not.toContain('finished')
  })

  it('settles the session on agent_settled', async () => {
    const child = new MockChildProcess()
    const server = createPiEventServer(child)
    spawnMock.mockReturnValue(child)

    const { statuses, attentions } = startSession()

    await waitFor(() => {
      expect(server.promptCount()).toBe(1)
    })

    server.emit({ type: 'agent_start' })
    server.emit({
      type: 'agent_end',
      willRetry: false,
      messages: [{ role: 'assistant', stopReason: 'stop' }],
    })
    server.emit({ type: 'agent_settled' })

    await waitFor(() => {
      expect(statuses).toContain('completed')
      expect(attentions).toContain('finished')
    })
  })

  it('carries an agent_end failure through to the settled signal', async () => {
    const child = new MockChildProcess()
    const server = createPiEventServer(child)
    spawnMock.mockReturnValue(child)

    const { statuses, attentions, items } = startSession()

    await waitFor(() => {
      expect(server.promptCount()).toBe(1)
    })

    server.emit({ type: 'agent_start' })
    server.emit({
      type: 'agent_end',
      willRetry: false,
      messages: [
        {
          role: 'assistant',
          stopReason: 'error',
          errorMessage: 'provider exploded',
        },
      ],
    })

    // Not settled yet, so no verdict has been published.
    expect(statuses).not.toContain('failed')

    server.emit({ type: 'agent_settled' })

    await waitFor(() => {
      expect(statuses).toContain('failed')
      expect(attentions).toContain('failed')
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'note',
            level: 'error',
            text: 'Agent failed: provider exploded',
          }),
        ]),
      )
    })
  })

  it('settles a retried run with the outcome of the final attempt', async () => {
    const child = new MockChildProcess()
    const server = createPiEventServer(child)
    spawnMock.mockReturnValue(child)

    const { statuses, attentions } = startSession()

    await waitFor(() => {
      expect(server.promptCount()).toBe(1)
    })

    server.emit({ type: 'agent_start' })
    server.emit({
      type: 'agent_end',
      willRetry: true,
      messages: [{ role: 'assistant', stopReason: 'error' }],
    })
    server.emit({ type: 'agent_start' })
    server.emit({
      type: 'agent_end',
      willRetry: false,
      messages: [{ role: 'assistant', stopReason: 'stop' }],
    })
    server.emit({ type: 'agent_settled' })

    await waitFor(() => {
      expect(statuses).toContain('completed')
      expect(attentions).toContain('finished')
    })
    expect(statuses).not.toContain('failed')
  })

  it('tolerates the pi 0.8x event families and notes extension errors', async () => {
    const child = new MockChildProcess()
    const server = createPiEventServer(child)
    spawnMock.mockReturnValue(child)

    const { statuses, items } = startSession()

    await waitFor(() => {
      expect(server.promptCount()).toBe(1)
    })

    server.emit({ type: 'agent_start' })
    server.emit({ type: 'bash_execution_update', id: 'bash-1', delta: 'ls\n' })
    server.emit({
      type: 'queue_update',
      steering: ['stay on task'],
      followUp: ['then run the tests'],
    })
    server.emit({
      type: 'summarization_retry_scheduled',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 100,
      errorMessage: 'summary failed',
    })
    server.emit({
      type: 'summarization_retry_attempt_start',
      source: 'compaction',
      reason: 'overflow',
    })
    server.emit({ type: 'summarization_retry_finished' })
    server.emit({
      type: 'extension_error',
      extensionPath: '/ext/linear.ts',
      event: 'agent_end',
      error: 'listener threw',
    })
    server.emit({ type: 'totally_unknown_future_event', payload: { a: 1 } })
    server.emit({
      type: 'agent_end',
      willRetry: false,
      messages: [{ role: 'assistant', stopReason: 'stop' }],
    })
    server.emit({ type: 'agent_settled' })

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    // Nothing crashed the session, and the extension failure is visible.
    expect(statuses).not.toContain('failed')
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          level: 'warning',
          text: 'Pi extension /ext/linear.ts failed on agent_end: listener threw',
        }),
      ]),
    )
  })
})
