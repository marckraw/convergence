import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  InteractionResponse,
  SessionDelta,
} from '../../session/conversation-item.types'

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

function captureCommands(
  child: MockChildProcess,
): Array<Record<string, unknown>> {
  const commands: Array<Record<string, unknown>> = []
  let buffer = ''
  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line) {
        commands.push(JSON.parse(line) as Record<string, unknown>)
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return commands
}

describe('PiProvider extension UI requests', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('surfaces select requests and sends the selected value back to Pi', async () => {
    const child = new MockChildProcess()
    const commands = captureCommands(child)
    spawnMock.mockReturnValue(child)

    const provider = new PiProvider('/usr/local/bin/pi')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'run extension',
      model: null,
      effort: null,
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const attention: string[] = []
    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange(() => {})
    handle.onAttentionChange((next) => attention.push(next))
    handle.onContinuationToken(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(commands.some((command) => command.type === 'prompt')).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        type: 'extension_ui_request',
        id: 'ui-1',
        method: 'select',
        title: 'Choose mode',
        options: ['Fast', 'Careful'],
      }) + '\n',
    )

    await waitFor(() => {
      const request = items.find((item) => item.kind === 'input-request') as
        | (Extract<SessionDelta, { kind: 'conversation.item.add' }>['item'] & {
            request?: unknown
          })
        | undefined
      expect(request?.request).toMatchObject({
        kind: 'choice',
        questions: [
          {
            question: 'Choose mode',
            options: [{ label: 'Fast' }, { label: 'Careful' }],
          },
        ],
      })
      expect(attention).toContain('needs-input')
    })

    const response: InteractionResponse = {
      kind: 'choice',
      answers: [{ questionId: 'value', values: ['Careful'] }],
    }
    handle.sendMessage('Careful', undefined, undefined, {
      deliveryMode: 'answer',
      interactionResponse: response,
    })

    await waitFor(() => {
      expect(commands).toContainEqual({
        type: 'extension_ui_response',
        id: 'ui-1',
        value: 'Careful',
      })
      expect(attention.at(-1)).toBe('none')
    })

    handle.stop()
  })

  it('cancels unsupported extension UI methods visibly', async () => {
    const child = new MockChildProcess()
    const commands = captureCommands(child)
    spawnMock.mockReturnValue(child)

    const provider = new PiProvider('/usr/local/bin/pi')
    const handle = provider.start({
      sessionId: 'session-2',
      workingDirectory: process.cwd(),
      initialMessage: 'run extension',
      model: null,
      effort: null,
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange(() => {})
    handle.onAttentionChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(commands.some((command) => command.type === 'prompt')).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        type: 'extension_ui_request',
        id: 'ui-2',
        method: 'custom',
      }) + '\n',
    )

    await waitFor(() => {
      expect(commands).toContainEqual({
        type: 'extension_ui_response',
        id: 'ui-2',
        cancelled: true,
      })
      expect(
        items.some(
          (item) =>
            item.kind === 'note' &&
            'text' in item &&
            item.text.includes("Unsupported Pi extension UI method 'custom'"),
        ),
      ).toBe(true)
    })

    handle.stop()
  })
})
