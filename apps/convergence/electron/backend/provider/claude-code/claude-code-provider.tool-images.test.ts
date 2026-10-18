vi.mock('./claude-transport.service', async () => ({
  createClaudeTransport: (await import('./claude-transport.fixture'))
    .createFixtureClaudeTransport,
}))
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { ClaudeCodeProvider } from './claude-code-provider'
import type { SessionDelta } from '../../session/conversation-item.types'

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  private exited = false

  kill = vi.fn(() => {
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

function toolResultEvent(content: unknown): string {
  return `${JSON.stringify({
    type: 'user',
    uuid: 'user-event-1',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content }],
    },
  })}\n`
}

function startSession(child: MockChildProcess, deltas: SessionDelta[]) {
  spawnMock.mockReturnValue(child)

  const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
  const handle = provider.start({
    sessionId: 'session-tool-images',
    workingDirectory: process.cwd(),
    initialMessage: 'take a screenshot',
    initialAttachments: undefined,
    model: null,
    effort: null,
    continuationToken: null,
  })

  handle.onDelta((delta) => deltas.push(delta))
  handle.onStatusChange(() => {})
  handle.onAttentionChange(() => {})
  handle.onContinuationToken(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})

  return handle
}

function toolResultDeltas(deltas: SessionDelta[]): SessionDelta[] {
  return deltas.filter(
    (delta) =>
      (delta.kind === 'conversation.item.add' &&
        delta.item.kind === 'tool-result') ||
      delta.kind === 'conversation.item.toolImages',
  )
}

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('a Claude tool result with images (MAR-4274)', () => {
  it('adds the result item, then hands its images over under its id', async () => {
    const child = new MockChildProcess()
    const deltas: SessionDelta[] = []
    startSession(child, deltas)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(
      toolResultEvent([
        { type: 'text', text: 'Screenshot saved' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: Buffer.from(PNG_BYTES).toString('base64'),
          },
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/tiff', data: 'AAAA' },
        },
      ]),
    )

    await waitFor(() => expect(toolResultDeltas(deltas)).toHaveLength(2))
    const [add, images] = toolResultDeltas(deltas)
    if (add.kind !== 'conversation.item.add') throw new Error('expected add')
    if (add.item.kind !== 'tool-result') throw new Error('expected result')
    // The text reads as it always has.
    expect(add.item.outputText).toBe('Screenshot saved')
    expect(images).toEqual({
      kind: 'conversation.item.toolImages',
      itemId: add.item.id,
      images: [
        { name: 'tool-image-1.png', mimeType: 'image/png', bytes: PNG_BYTES },
      ],
      omissions: { 'unsupported-mime-type': 1 },
    })
  })

  it('keeps an image-only result text-free, as before', async () => {
    const child = new MockChildProcess()
    const deltas: SessionDelta[] = []
    startSession(child, deltas)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(
      toolResultEvent([
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: Buffer.from(PNG_BYTES).toString('base64'),
          },
        },
      ]),
    )

    await waitFor(() => expect(toolResultDeltas(deltas)).toHaveLength(2))
    const [add, images] = toolResultDeltas(deltas)
    if (add.kind !== 'conversation.item.add') throw new Error('expected add')
    if (add.item.kind !== 'tool-result') throw new Error('expected result')
    expect(add.item.outputText).toBe('')
    expect(images).toMatchObject({
      kind: 'conversation.item.toolImages',
      itemId: add.item.id,
      omissions: {},
    })
  })

  it('emits no image delta for a text-only result', async () => {
    const child = new MockChildProcess()
    const deltas: SessionDelta[] = []
    startSession(child, deltas)

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(toolResultEvent([{ type: 'text', text: 'done' }]))
    child.stdout.write(toolResultEvent('plain output'))

    await waitFor(() => expect(toolResultDeltas(deltas)).toHaveLength(2))
    expect(toolResultDeltas(deltas).map((delta) => delta.kind)).toEqual([
      'conversation.item.add',
      'conversation.item.add',
    ])
  })
})
