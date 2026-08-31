import { EventEmitter } from 'events'
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

function makeAttachment(id: string, filename: string): Attachment {
  return {
    id,
    sessionId: 'session-x',
    kind: 'image',
    mimeType: 'image/png',
    filename,
    sizeBytes: 1,
    storagePath: `/nonexistent/${id}.png`,
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

describe('ClaudeCodeProvider addUserMessage attachmentIds', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('persists attachmentIds on the user conversation item when attachments are provided', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'review these',
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

  it('omits attachmentIds when no attachments are provided', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new ClaudeCodeProvider('/usr/local/bin/claude')
    const handle = provider.start({
      sessionId: 'session-2',
      workingDirectory: process.cwd(),
      initialMessage: 'hello',
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
