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
  options?: {
    missingThreadIds?: string[]
    skillsResponse?: unknown
    autoCompleteTurns?: boolean
    turnStartedId?: string
    steerError?: string
  },
): {
  requests: Array<{ method: string; params?: Record<string, unknown> }>
  responses: Array<{ id: string | number; result?: unknown; error?: unknown }>
} {
  const missingThreadIds = new Set(options?.missingThreadIds ?? [])
  const requests: Array<{
    method: string
    params?: Record<string, unknown>
  }> = []
  const responses: Array<{
    id: string | number
    result?: unknown
    error?: unknown
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
          id?: string | number
          method?: string
          params?: Record<string, unknown>
          result?: unknown
          error?: unknown
        }

        if ('id' in message && !('method' in message)) {
          responses.push({
            id: message.id as string | number,
            result: message.result,
            error: message.error,
          })
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
            respond(
              message.id,
              options?.turnStartedId
                ? { turn: { id: options.turnStartedId } }
                : {},
            )
            if (options?.turnStartedId) {
              enqueue(() => {
                child.stdout.write(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'turn/started',
                    params: { turn: { id: options.turnStartedId } },
                  }) + '\n',
                )
              })
            }
            if (options?.autoCompleteTurns !== false) {
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
          }
        } else if (
          message.method === 'turn/steer' &&
          typeof message.id === 'number'
        ) {
          if (options?.steerError) {
            reject(message.id, options.steerError)
          } else {
            respond(message.id, {})
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

  return { requests, responses }
}

describe('CodexProvider', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('starts yolo threads without approvals or sandboxing', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child)
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-yolo',
      workingDirectory: process.cwd(),
      initialMessage: 'ship it',
      model: 'gpt-5.4',
      effort: 'medium',
      serviceTier: 'fast',
      continuationToken: null,
      permissionConfig: { preset: 'yolo' },
    })

    handle.onDelta(() => {})
    handle.onStatusChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'thread/start'),
      ).toBe(true)
    })

    expect(server.requests).toContainEqual(
      expect.objectContaining({
        method: 'thread/start',
        params: expect.objectContaining({
          approvalPolicy: 'never',
          sandbox: 'danger-full-access',
          serviceTier: 'fast',
        }),
      }),
    )

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    expect(server.requests).toContainEqual(
      expect.objectContaining({
        method: 'turn/start',
        params: expect.objectContaining({
          serviceTier: 'fast',
        }),
      }),
    )
  })

  it('emits thinking conversation items from Codex reasoning deltas', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, { autoCompleteTurns: false })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'think first',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: null,
    })

    const items = new Map<
      string,
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    >()
    const statuses: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.set(delta.item.id, delta.item)
      }
      if (delta.kind === 'conversation.item.patch') {
        const existing = items.get(delta.itemId)
        if (existing) {
          items.set(delta.itemId, {
            ...existing,
            ...delta.patch,
          } as Extract<SessionDelta, { kind: 'conversation.item.add' }>['item'])
        }
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
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'item/started',
        params: { item: { id: 'reasoning-1', type: 'reasoning' } },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'item/reasoning/textDelta',
        params: { itemId: 'reasoning-1', delta: 'Checking ' },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'item/reasoning/summaryTextDelta',
        params: { itemId: 'reasoning-1', delta: 'constraints' },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'item/completed',
        params: { item: { id: 'reasoning-1', type: 'reasoning' } },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'turn/completed',
        params: { turn: { status: 'completed' } },
      }) + '\n',
    )

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect([...items.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'thinking',
          text: 'Checking constraints',
          state: 'complete',
          providerMeta: expect.objectContaining({
            providerItemId: 'reasoning-1',
          }),
        }),
      ]),
    )
  })

  it('preserves provider metadata for completed-only Codex reasoning items', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, { autoCompleteTurns: false })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'think without deltas',
      initialAttachments: undefined,
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
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'item/started',
        params: { item: { id: 'reasoning-complete', type: 'reasoning' } },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'item/completed',
        params: {
          item: {
            id: 'reasoning-complete',
            type: 'reasoning',
            text: 'Completed-only reasoning',
          },
        },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'turn/completed',
        params: { turn: { status: 'completed' } },
      }) + '\n',
    )

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'thinking',
          text: 'Completed-only reasoning',
          state: 'complete',
          providerMeta: expect.objectContaining({
            providerItemId: 'reasoning-complete',
            providerEventType: 'reasoning',
          }),
        }),
      ]),
    )
  })

  it('does not duplicate Codex reasoning when completed metadata arrives after assistant text', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, { autoCompleteTurns: false })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'think first',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: null,
    })

    const items = new Map<
      string,
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    >()
    const statuses: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.set(delta.item.id, delta.item)
      }
      if (delta.kind === 'conversation.item.patch') {
        const existing = items.get(delta.itemId)
        if (existing) {
          items.set(delta.itemId, {
            ...existing,
            ...delta.patch,
          } as Extract<SessionDelta, { kind: 'conversation.item.add' }>['item'])
        }
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
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'item/started',
        params: { item: { id: 'reasoning-1', type: 'reasoning' } },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'item/reasoning/textDelta',
        params: { itemId: 'reasoning-1', delta: 'Checking constraints' },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'item/agentMessage/delta',
        params: { itemId: 'message-1', delta: 'Done.' },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'item/completed',
        params: {
          item: {
            id: 'reasoning-1',
            type: 'reasoning',
            text: 'Checking constraints',
          },
        },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'turn/completed',
        params: { turn: { status: 'completed' } },
      }) + '\n',
    )

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    const transcriptItems = [...items.values()]
    const thinkingItems = transcriptItems.filter(
      (item) => item.kind === 'thinking',
    )
    expect(thinkingItems).toHaveLength(1)
    expect(thinkingItems[0]).toEqual(
      expect.objectContaining({
        text: 'Checking constraints',
        state: 'complete',
        providerMeta: expect.objectContaining({
          providerItemId: 'reasoning-1',
        }),
      }),
    )
    expect(
      transcriptItems
        .filter(
          (item) =>
            item.kind === 'thinking' ||
            (item.kind === 'message' && item.actor === 'assistant'),
        )
        .map((item) => item.kind),
    ).toEqual(['thinking', 'message'])
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

  it('surfaces MCP elicitation requests as approvals and responds on approve', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      autoCompleteTurns: false,
      turnStartedId: 'codex-turn-1',
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'open a Linear issue',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const attentions: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onAttentionChange((attention) => {
      attentions.push(attention)
    })
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'mcpServer/elicitation/request',
        params: {
          threadId: 'fresh-thread',
          turnId: 'codex-turn-1',
          serverName: 'linear',
          mode: 'form',
          _meta: null,
          message: 'Allow the linear MCP server to run tool "save_issue"?',
          requestedSchema: {
            type: 'object',
            properties: {},
          },
        },
      }) + '\n',
    )

    await waitFor(() => {
      expect(attentions).toContain('needs-approval')
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'approval-request',
            description: expect.stringContaining(
              'Allow the linear MCP server to run tool',
            ),
            providerMeta: expect.objectContaining({
              providerItemId: '100',
            }),
          }),
        ]),
      )
    })

    handle.approve()

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 100,
        result: {
          action: 'accept',
          content: {},
          _meta: null,
        },
      })
    })
  })

  it('surfaces MCP form elicitations as structured input requests', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      autoCompleteTurns: false,
      turnStartedId: 'codex-turn-1',
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'create a Linear issue',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const attentions: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onAttentionChange((attention) => {
      attentions.push(attention)
    })
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'mcpServer/elicitation/request',
        params: {
          serverName: 'linear',
          mode: 'form',
          _meta: { requestId: 'mcp-1' },
          message: 'Create an issue?',
          requestedSchema: {
            type: 'object',
            required: ['title'],
            properties: {
              title: {
                type: 'string',
                title: 'Title',
                default: 'Bug report',
              },
              estimate: {
                type: 'number',
                title: 'Estimate',
                default: 3,
              },
              urgent: {
                type: 'boolean',
                title: 'Urgent',
                default: true,
              },
            },
          },
        },
      }) + '\n',
    )

    await waitFor(() => {
      expect(attentions).toContain('needs-input')
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'input-request',
            prompt: 'Create an issue?',
            request: {
              kind: 'form',
              title: 'linear request',
              message: 'Create an issue?',
              fields: [
                expect.objectContaining({
                  id: 'title',
                  label: 'Title',
                  type: 'string',
                  required: true,
                  defaultValue: 'Bug report',
                }),
                expect.objectContaining({
                  id: 'estimate',
                  type: 'number',
                  defaultValue: 3,
                }),
                expect.objectContaining({
                  id: 'urgent',
                  type: 'boolean',
                  defaultValue: true,
                }),
              ],
            },
            providerMeta: expect.objectContaining({
              providerItemId: '100',
              providerEventType: 'mcpServer/elicitation/request',
            }),
          }),
        ]),
      )
    })

    handle.sendMessage('Submitted form', undefined, undefined, {
      deliveryMode: 'answer',
      interactionResponse: {
        kind: 'form',
        action: 'accept',
        values: {
          title: 'Bug report',
          estimate: 5,
          urgent: false,
        },
      },
    })

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 100,
        result: {
          action: 'accept',
          content: {
            title: 'Bug report',
            estimate: 5,
            urgent: false,
          },
          _meta: { requestId: 'mcp-1' },
        },
      })
      expect(attentions).toContain('none')
    })
  })

  it('fails MCP form elicitations with unsupported fields instead of rendering partial forms', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      autoCompleteTurns: false,
      turnStartedId: 'codex-turn-1',
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'create a Linear issue',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const statuses: string[] = []
    const attentions: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange((status) => {
      statuses.push(status)
    })
    handle.onContinuationToken(() => {})
    handle.onAttentionChange((attention) => {
      attentions.push(attention)
    })
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 102,
        method: 'mcpServer/elicitation/request',
        params: {
          serverName: 'linear',
          mode: 'form',
          message: 'Create an issue?',
          requestedSchema: {
            type: 'object',
            required: ['title', 'labels'],
            properties: {
              title: {
                type: 'string',
                title: 'Title',
              },
              labels: {
                type: 'array',
                title: 'Labels',
              },
            },
          },
        },
      }) + '\n',
    )

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 102,
        error: {
          code: -32602,
          message:
            'Convergence could not render Codex MCP elicitation mode "form"',
        },
        result: undefined,
      })
      expect(statuses).toContain('failed')
      expect(attentions).toContain('failed')
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'note',
            level: 'error',
            text: 'Unsupported Codex MCP elicitation schema for mode: form',
          }),
        ]),
      )
    })

    expect(items.some((item) => item.kind === 'input-request')).toBe(false)
  })

  it('surfaces MCP URL elicitations and responds on decline', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      autoCompleteTurns: false,
      turnStartedId: 'codex-turn-1',
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'open auth URL',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
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
    handle.onContinuationToken(() => {})
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 101,
        method: 'mcpServer/elicitation/request',
        params: {
          serverName: 'github',
          mode: 'url',
          message: 'Open GitHub authorization URL?',
          url: 'https://github.com/login/oauth/authorize',
        },
      }) + '\n',
    )

    await waitFor(() => {
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'input-request',
            request: {
              kind: 'url',
              title: 'github request',
              message: 'Open GitHub authorization URL?',
              url: 'https://github.com/login/oauth/authorize',
            },
          }),
        ]),
      )
    })

    handle.sendMessage('Declined URL', undefined, undefined, {
      deliveryMode: 'answer',
      interactionResponse: {
        kind: 'url',
        action: 'decline',
      },
    })

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 101,
        result: {
          action: 'decline',
          content: null,
          _meta: null,
        },
      })
    })
  })

  it('surfaces Codex user-input questions as structured choice requests and answers them', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      autoCompleteTurns: false,
      turnStartedId: 'codex-turn-1',
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'configure project scripts',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: null,
    })

    const items: Array<
      Extract<SessionDelta, { kind: 'conversation.item.add' }>['item']
    > = []
    const attentions: string[] = []

    handle.onDelta((delta) => {
      if (delta.kind === 'conversation.item.add') {
        items.push(delta.item)
      }
    })
    handle.onStatusChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onAttentionChange((attention) => {
      attentions.push(attention)
    })
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'item/tool/requestUserInput',
        params: {
          questions: [
            {
              id: 'working_dir',
              question: 'Where should scripts run?',
              header: 'Working dir',
              multiSelect: false,
              options: [
                {
                  label: 'Project root only',
                  description:
                    'Scripts always run in the project main repo path.',
                },
                {
                  label: 'Active workspace',
                  description: 'Scripts run in the current worktree.',
                },
              ],
            },
          ],
        },
      }) + '\n',
    )

    await waitFor(() => {
      expect(attentions).toContain('needs-input')
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'input-request',
            prompt: 'Where should scripts run?',
            request: {
              kind: 'choice',
              questions: [
                expect.objectContaining({
                  id: 'working_dir',
                  question: 'Where should scripts run?',
                  header: 'Working dir',
                  options: [
                    expect.objectContaining({
                      label: 'Project root only',
                    }),
                    expect.objectContaining({
                      label: 'Active workspace',
                    }),
                  ],
                }),
              ],
            },
            providerMeta: expect.objectContaining({
              providerItemId: '100',
              providerEventType: 'item/tool/requestUserInput',
            }),
          }),
        ]),
      )
    })

    handle.sendMessage('Active workspace', undefined, undefined, {
      deliveryMode: 'answer',
      interactionResponse: {
        kind: 'choice',
        answers: [
          {
            questionId: 'working_dir',
            values: ['Active workspace'],
          },
        ],
      },
    })

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 100,
        result: {
          answers: {
            working_dir: {
              answers: ['Active workspace'],
            },
          },
        },
      })
      expect(attentions).toContain('none')
    })
  })

  it('falls back to text input for mixed Codex user-input questions', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      autoCompleteTurns: false,
      turnStartedId: 'codex-turn-1',
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'configure project scripts',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
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
    handle.onContinuationToken(() => {})
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 103,
        method: 'item/tool/requestUserInput',
        params: {
          questions: [
            {
              id: 'working_dir',
              question: 'Where should scripts run?',
              options: [{ label: 'Project root only' }, { label: 'Workspace' }],
            },
            {
              id: 'script_name',
              question: 'Which script should run?',
            },
          ],
        },
      }) + '\n',
    )

    await waitFor(() => {
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'input-request',
            prompt: 'Where should scripts run?\nWhich script should run?',
            request: {
              kind: 'text',
              prompt: 'Where should scripts run?\nWhich script should run?',
            },
          }),
        ]),
      )
    })

    handle.sendMessage('Workspace; npm test', undefined, undefined, {
      deliveryMode: 'answer',
    })

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 103,
        result: {
          answers: {
            working_dir: {
              answers: ['Workspace; npm test'],
            },
            script_name: {
              answers: ['Workspace; npm test'],
            },
          },
        },
      })
    })
  })

  it('responds to the requested Codex approval when an approval id is provided', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      autoCompleteTurns: false,
      turnStartedId: 'codex-turn-1',
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'run commands',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
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
    handle.onContinuationToken(() => {})
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'item/commandExecution/requestApproval',
        params: {
          command: 'diskutil apfs list',
          reason: 'Inspect volumes',
        },
      }) + '\n',
    )
    child.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 101,
        method: 'item/commandExecution/requestApproval',
        params: {
          command: 'top -l 1',
          reason: 'Inspect processes',
        },
      }) + '\n',
    )

    await waitFor(() => {
      expect(
        items.filter((item) => item.kind === 'approval-request'),
      ).toHaveLength(2)
    })

    handle.approve('101')

    await waitFor(() => {
      expect(server.responses).toContainEqual({
        id: 101,
        result: { decision: 'accept' },
      })
    })
    expect(server.responses).not.toContainEqual({
      id: 100,
      result: { decision: 'accept' },
    })
  })

  it('routes steering input to turn/steer without starting a second turn', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      autoCompleteTurns: false,
      turnStartedId: 'codex-turn-1',
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'start long work',
      initialAttachments: undefined,
      model: 'gpt-5.4',
      effort: 'medium',
      continuationToken: null,
    })

    handle.onDelta(() => {})
    handle.onStatusChange(() => {})
    handle.onContinuationToken(() => {})
    handle.onAttentionChange(() => {})
    handle.onContextWindowChange(() => {})
    handle.onActivityChange(() => {})

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    handle.sendMessage('avoid the auth migration', undefined, undefined, {
      deliveryMode: 'steer',
    })

    await waitFor(() => {
      expect(
        server.requests.some((request) => request.method === 'turn/steer'),
      ).toBe(true)
    })

    const turnStarts = server.requests.filter(
      (request) => request.method === 'turn/start',
    )
    const steer = server.requests.find(
      (request) => request.method === 'turn/steer',
    )
    expect(turnStarts).toHaveLength(1)
    expect(steer?.params).toMatchObject({
      threadId: 'fresh-thread',
      expectedTurnId: 'codex-turn-1',
      input: [
        {
          type: 'text',
          text: 'avoid the auth migration',
          text_elements: [],
        },
      ],
    })
  })

  it('reports stale Codex steer failure without failing the active session', async () => {
    const child = new MockChildProcess()
    const server = createMockCodexServer(child, {
      autoCompleteTurns: false,
      turnStartedId: 'codex-turn-1',
      steerError: 'expected turn id is stale',
    })
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/usr/local/bin/codex')
    const handle = provider.start({
      sessionId: 'session-1',
      workingDirectory: process.cwd(),
      initialMessage: 'start long work',
      initialAttachments: undefined,
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
      expect(
        server.requests.some((request) => request.method === 'turn/start'),
      ).toBe(true)
    })

    handle.sendMessage('avoid the auth migration', undefined, undefined, {
      deliveryMode: 'steer',
    })

    await waitFor(() => {
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'note',
            level: 'error',
            text: 'Mid-run input failed: expected turn id is stale',
          }),
        ]),
      )
    })

    expect(statuses).toContain('running')
    expect(statuses).not.toContain('failed')
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
