import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import { buildSkillCatalogId } from '../../skills/skill-catalog.pure'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CodexProvider } from './codex-provider'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false

  kill = vi.fn((signal?: NodeJS.Signals) => {
    this.killed = true
    this.emit('exit', signal === 'SIGKILL' ? 137 : 0)
    return true
  })
}

function waitFor(
  assertion: () => void,
  timeoutMs = 250,
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

function createMockCodexServer(
  child: MockChildProcess,
  options?: { missingThreadIds?: string[]; skillsResponse?: unknown },
): {
  requests: Array<{ method: string; params?: Record<string, unknown> }>
} {
  const missingThreadIds = new Set(options?.missingThreadIds ?? [])
  const requests: Array<{
    method: string
    params?: Record<string, unknown>
  }> = []
  let buffer = ''
  const enqueue = (fn: () => void) => {
    setTimeout(fn, 0)
  }

  const respond = (id: number, result: unknown) => {
    enqueue(() => {
      child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
    })
  }

  const reject = (id: number, message: string) => {
    enqueue(() => {
      child.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message },
        }) + '\n',
      )
    })
  }

  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)

      if (line) {
        const message = JSON.parse(line) as {
          id?: number
          method?: string
          params?: Record<string, unknown>
        }

        if (
          typeof message.id === 'number' &&
          typeof message.method === 'string'
        ) {
          requests.push({
            method: message.method,
            params: message.params,
          })
        }

        if (message.method === 'initialize' && typeof message.id === 'number') {
          respond(message.id, {})
        } else if (
          message.method === 'thread/resume' &&
          typeof message.id === 'number'
        ) {
          if (
            typeof message.params?.threadId === 'string' &&
            missingThreadIds.has(message.params.threadId)
          ) {
            reject(message.id, `thread not found: ${message.params.threadId}`)
          } else {
            respond(message.id, {
              thread: { id: message.params?.threadId ?? 'resumed-thread' },
            })
          }
        } else if (
          message.method === 'turn/start' &&
          typeof message.id === 'number'
        ) {
          if (
            typeof message.params?.threadId === 'string' &&
            missingThreadIds.has(message.params.threadId)
          ) {
            reject(message.id, `thread not found: ${message.params.threadId}`)
          } else {
            respond(message.id, {})
            enqueue(() => {
              child.stdout.write(
                JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'turn/completed',
                  params: { turn: { status: 'completed' } },
                }) + '\n',
              )
            })
          }
        } else if (
          message.method === 'thread/start' &&
          typeof message.id === 'number'
        ) {
          respond(message.id, { threadId: 'fresh-thread' })
        } else if (
          message.method === 'skills/list' &&
          typeof message.id === 'number'
        ) {
          respond(message.id, options?.skillsResponse ?? { skills: [] })
        }
      }

      newlineIndex = buffer.indexOf('\n')
    }
  })

  return { requests }
}

describe('CodexProvider', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('resumes a continuation thread before starting a new turn', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'continue from before',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: 'resume-thread',
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const statuses: string[] = []
    const continuationTokens: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
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

    expect(server.requests.map(({ method }) => method)).toEqual([
      'initialize',
      'thread/resume',
      'turn/start',
    ])
    expect(server.requests).toContainEqual(
      expect.objectContaining({
        method: 'turn/start',
        params: expect.objectContaining({ threadId: 'resume-thread' }),
      }),
    )
    expect(
      server.requests.some(({ method }) => method === 'thread/start'),
    ).toBe(false)
    expect(continuationTokens).toEqual(['resume-thread'])
    expect(statuses).toContain('running')
    expect(statuses).not.toContain('failed')
    expect(
      items.some(
        (item) =>
          item.kind === 'note' &&
          item.text.includes('thread was no longer available'),
      ),
    ).toBe(false)
  })

  it('recovers from a stale continuation thread by starting a fresh thread', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      missingThreadIds: ['dead-thread'],
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'are you good?',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: 'dead-thread',
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const statuses: string[] = []
    const continuationTokens: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
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

    expect(server.requests.map(({ method }) => method)).toEqual([
      'initialize',
      'thread/resume',
      'thread/start',
      'turn/start',
    ])
    expect(server.requests).toContainEqual(
      expect.objectContaining({
        method: 'turn/start',
        params: expect.objectContaining({ threadId: 'fresh-thread' }),
      }),
    )
    expect(continuationTokens).toEqual(['dead-thread', 'fresh-thread'])
    expect(statuses).toContain('running')
    expect(statuses).not.toContain('failed')

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'message',
          actor: 'user',
          text: 'are you good?',
        }),
        expect.objectContaining({
          kind: 'note',
          text: 'Codex thread was no longer available. Started a new thread; previous provider context may be missing.',
        }),
      ]),
    )
    expect(
      items.some(
        (item) =>
          item.kind === 'note' &&
          item.text.startsWith('Initialization failed:'),
      ),
    ).toBe(false)
  })

  it('sends selected Codex skills as native turn input and patches chips to sent', async () => {
    const skillPath = '/catalog/skills/planning/SKILL.md'
    const skillId = buildSkillCatalogId({
      providerId: 'codex',
      name: 'planning',
      path: skillPath,
      scope: 'global',
      rawScope: 'global',
    })
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      skillsResponse: {
        skills: [
          {
            name: 'planning',
            path: skillPath,
            scope: 'global',
            description: 'Plan implementation work.',
            enabled: true,
          },
        ],
      },
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'review this plan',
      initialAttachments: undefined,
      initialSkillSelections: [
        {
          id: skillId,
          providerId: 'codex',
          providerName: 'Codex',
          name: 'planning',
          displayName: 'Planning',
          path: '/renderer/stale/SKILL.md',
          scope: 'global',
          rawScope: 'global',
          sourceLabel: 'Global',
          status: 'selected',
        },
      ],
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const patches: Array<
      Extract<SessionDelta, { kind: 'conversation.item.patch' }>
    > = []
    const statuses: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
      if (delta.kind === 'conversation.item.patch') {
        patches.push(delta)
      }
    })
    handle.onStatusChange((status) => {
      statuses.push(status)
    })
    handle.onContinuationToken(() => {})
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    const turnStart = server.requests.find(
      (request) => request.method === 'turn/start',
    )
    expect(turnStart?.params).toMatchObject({
      input: [
        {
          type: 'text',
          text: '$planning\n\nreview this plan',
          text_elements: [],
        },
        {
          type: 'skill',
          name: 'planning',
          path: skillPath,
        },
      ],
    })
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'message',
          actor: 'user',
          skillSelections: [
            expect.objectContaining({
              id: skillId,
              path: skillPath,
              status: 'selected',
            }),
          ],
        }),
      ]),
    )
    expect(patches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          patch: expect.objectContaining({
            skillSelections: [
              expect.objectContaining({
                id: skillId,
                status: 'sent',
              }),
            ],
          }),
        }),
      ]),
    )
  })

  it('marks stale selected Codex skills unavailable without starting a turn', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      skillsResponse: { skills: [] },
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'use missing skill',
      initialAttachments: undefined,
      initialSkillSelections: [
        {
          id: 'skill:codex:missing',
          providerId: 'codex',
          providerName: 'Codex',
          name: 'missing',
          displayName: 'Missing',
          path: '/missing/SKILL.md',
          scope: 'global',
          rawScope: 'global',
          sourceLabel: 'Global',
          status: 'selected',
        },
      ],
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const statuses: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange((status) => {
      statuses.push(status)
    })
    handle.onContinuationToken(() => {})
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(statuses).toContain('failed')
    })

    expect(
      server.requests.some((request) => request.method === 'turn/start'),
    ).toBe(false)
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'message',
          actor: 'user',
          skillSelections: [
            expect.objectContaining({
              id: 'skill:codex:missing',
              status: 'unavailable',
            }),
          ],
        }),
        expect.objectContaining({
          kind: 'note',
          text: 'Codex skill unavailable: Selected Codex skill "Missing" is no longer available.',
        }),
      ]),
    )
  })

  it('persists attachmentIds on the user conversation item when attachments are provided', async () => {
    const child = new MockChildProcess()
    createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'review these',
      initialAttachments: [
        {
          id: 'att-1',
          sessionId: 'session-1',
          kind: 'image',
          mimeType: 'image/png',
          filename: 'one.png',
          sizeBytes: 1,
          storagePath: '/nonexistent/att-1.png',
          thumbnailPath: null,
          textPreview: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'att-2',
          sessionId: 'session-1',
          kind: 'image',
          mimeType: 'image/png',
          filename: 'two.png',
          sizeBytes: 1,
          storagePath: '/nonexistent/att-2.png',
          thumbnailPath: null,
          textPreview: null,
          createdAt: new Date().toISOString(),
        },
      ],
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: 'resume-thread',
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
      const userMessage = items.find(
        (item) =>
          item.kind === 'message' && 'actor' in item && item.actor === 'user',
      )
      expect(userMessage).toBeDefined()
      const payload = userMessage as unknown as { attachmentIds?: string[] }
      expect(payload.attachmentIds).toEqual(['att-1', 'att-2'])
    })

    handle.stop()
  })

  it('omits attachmentIds when no attachments are provided', async () => {
    const child = new MockChildProcess()
    createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-2',
      workingDirectory: process.cwd(),
      initialMessage: 'hi',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: 'resume-thread',
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
      const userMessage = items.find(
        (item) =>
          item.kind === 'message' && 'actor' in item && item.actor === 'user',
      )
      expect(userMessage).toBeDefined()
      const payload = userMessage as unknown as { attachmentIds?: string[] }
      expect(payload.attachmentIds).toBeUndefined()
    })

    handle.stop()
  })
})
