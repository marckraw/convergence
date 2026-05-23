import { EventEmitter } from 'events'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import type { Attachment } from '../../attachments/attachments.types'

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

function makeAttachment(
  id: string,
  filename: string,
  storagePath = `/nonexistent/${id}.png`,
): Attachment {
  return {
    id,
    sessionId: 'session-x',
    kind: 'image',
    mimeType: 'image/png',
    filename,
    sizeBytes: 1,
    storagePath,
    thumbnailPath: null,
    textPreview: null,
    createdAt: new Date().toISOString(),
  }
}

function captureFirstUserMessage(
  items: Array<
    Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
  >,
): { kind: string; attachmentIds?: string[] } | undefined {
  const found = items.find(
    (item) =>
      item.kind === 'message' && 'actor' in item && item.actor === 'user',
  )
  if (!found) return undefined
  const payload = found as unknown as { attachmentIds?: string[]; kind: string }
  return { kind: found.kind, attachmentIds: payload.attachmentIds }
}

describe('PiProvider addUserMessage attachmentIds', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('persists attachmentIds on the user conversation item when attachments are provided', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new PiProvider('/usr/local/bin/pi')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'describe these',
      initialAttachments: [
        makeAttachment('att-1', 'one.png'),
        makeAttachment('att-2', 'two.png'),
      ],
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
      const userMessage = captureFirstUserMessage(items)
      expect(userMessage).toBeDefined()
      expect(userMessage?.attachmentIds).toEqual(['att-1', 'att-2'])
    })

    handle.stop()
  })

  it('sends image attachments as Pi RPC images on the outbound prompt command', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'convergence-pi-attachment-'))
    const imagePath = join(tmp, 'pixel.png')
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    try {
      const child = new MockChildProcess()
      const stdinChunks: string[] = []
      child.stdin.on('data', (chunk: Buffer) => {
        stdinChunks.push(chunk.toString('utf8'))
      })
      spawnMock.mockReturnValue(child)

      const debugEntries: unknown[] = []
      const provider = new PiProvider('/usr/local/bin/pi', null, {
        record: (entry) => {
          debugEntries.push(entry)
        },
      })
      const handle = provider.start({
        sessionId: 'session-3',
        workingDirectory: process.cwd(),
        initialMessage: 'describe this image',
        initialAttachments: [makeAttachment('att-1', 'pixel.png', imagePath)],
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

      await waitFor(() => {
        const promptLine = stdinChunks
          .join('')
          .split('\n')
          .filter(Boolean)
          .find((line) => JSON.parse(line).type === 'prompt')
        expect(promptLine).toBeDefined()

        const prompt = JSON.parse(promptLine ?? '{}') as {
          message?: string
          images?: Array<{ type?: string; data?: string; mimeType?: string }>
        }
        expect(prompt.message).toContain('describe this image')
        expect(prompt.message).toContain('<attached-files>')
        expect(prompt.message).toContain(`path: ${imagePath}`)
        expect(prompt.images).toEqual([
          {
            type: 'image',
            data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
            mimeType: 'image/png',
          },
        ])
      })

      expect(debugEntries).toContainEqual(
        expect.objectContaining({
          channel: 'request',
          direction: 'out',
          method: 'prompt',
          payload: expect.objectContaining({
            imageCount: 1,
            images: [
              {
                type: 'image',
                mimeType: 'image/png',
                bytes: 4,
              },
            ],
          }),
        }),
      )

      handle.stop()
    } finally {
      rmSync(tmp, { force: true, recursive: true })
    }
  })

  it('omits attachmentIds when no attachments are provided', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new PiProvider('/usr/local/bin/pi')
    const handle = provider.start({
      sessionId: 'session-2',
      workingDirectory: process.cwd(),
      initialMessage: 'hi',
      initialAttachments: undefined,
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
      const userMessage = captureFirstUserMessage(items)
      expect(userMessage).toBeDefined()
      expect(userMessage?.attachmentIds).toBeUndefined()
    })

    handle.stop()
  })
})
