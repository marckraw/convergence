import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import {
  CLAUDE_CODE_MID_RUN_INPUT_CAPABILITY,
  NO_MID_RUN_INPUT_CAPABILITY,
} from '../provider/provider-descriptor.pure'
import { ProviderRegistry } from '../provider/provider-registry'
import { ProviderSessionEmitter } from '../provider/provider-session.emitter'
import type {
  ActivitySignal,
  Attachment,
  Provider,
  SessionHandle,
  SessionStatus,
  AttentionState,
  SessionContextWindow,
} from '../provider/provider.types'
import type { ProviderAttachmentCapability } from '../provider/provider.types'
import { AttachmentsService } from '../attachments/attachments.service'
import type { SessionDelta } from './conversation-item.types'
import { SessionService } from './session.service'

const TEST_ATTACHMENT_CAPABILITY: ProviderAttachmentCapability = {
  supportsImage: true,
  supportsPdf: true,
  supportsText: true,
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 20 * 1024 * 1024,
  maxTextBytes: 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
}

function now(): string {
  return new Date().toISOString()
}

function createTestProvider(): Provider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    supportsContinuation: false,
    describe: async () => ({
      id: 'test-provider',
      name: 'Test Provider',
      vendorLabel: 'Test',
      kind: 'conversation',
      supportsContinuation: false,
      defaultModelId: 'test-model',
      modelOptions: [
        {
          id: 'test-model',
          label: 'Test Model',
          defaultEffort: null,
          effortOptions: [],
        },
      ],
      attachments: TEST_ATTACHMENT_CAPABILITY,
      midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
    }),
    start(config) {
      const listeners = {
        delta: [] as Array<(delta: SessionDelta) => void>,
        status: [] as Array<(status: SessionStatus) => void>,
        attention: [] as Array<(attention: AttentionState) => void>,
        contextWindow: [] as Array<
          (contextWindow: SessionContextWindow) => void
        >,
        activity: [] as Array<(activity: ActivitySignal) => void>,
      }

      const timers: ReturnType<typeof setTimeout>[] = []
      let stopped = false
      let approveResolve: (() => void) | null = null

      const emitDelta = (delta: SessionDelta) => {
        listeners.delta.forEach((cb) => cb(delta))
      }

      const sessionEmitter = new ProviderSessionEmitter({
        providerId: 'test-provider',
        emitDelta,
        now,
      })

      const emitStatus = (status: SessionStatus) => {
        listeners.status.forEach((cb) => cb(status))
        sessionEmitter.patchSession({ status })
      }

      const emitAttention = (attention: AttentionState) => {
        listeners.attention.forEach((cb) => cb(attention))
        sessionEmitter.patchSession({ attention })
      }

      const emitContextWindow = (contextWindow: SessionContextWindow) => {
        listeners.contextWindow.forEach((cb) => cb(contextWindow))
        sessionEmitter.patchSession({ contextWindow })
      }

      const emitActivity = (activity: ActivitySignal) => {
        listeners.activity.forEach((cb) => cb(activity))
        sessionEmitter.patchSession({ activity })
      }

      const schedule = (callback: () => void, delay: number) => {
        if (stopped) return
        timers.push(
          setTimeout(() => {
            if (!stopped) callback()
          }, delay),
        )
      }

      schedule(() => {
        emitStatus('running')
        emitActivity('streaming')
        emitContextWindow({
          availability: 'available',
          source: 'provider',
          usedTokens: 2048,
          windowTokens: 200000,
          usedPercentage: 1,
          remainingPercentage: 99,
        })
        sessionEmitter.addUserMessage({ text: config.initialMessage })

        schedule(() => {
          sessionEmitter.addAssistantMessage({
            text: 'Starting analysis...',
            state: 'complete',
          })
        }, 300)

        schedule(() => {
          sessionEmitter.addAssistantMessage({
            text: 'Preparing an edit.',
            state: 'complete',
          })
        }, 800)

        schedule(() => {
          sessionEmitter.addApprovalRequest({
            description: 'Edit src/main.ts',
          })
          emitAttention('needs-approval')

          new Promise<void>((resolve) => {
            approveResolve = resolve
          }).then(() => {
            if (stopped) return
            emitAttention('none')

            sessionEmitter.addToolCall({
              toolName: 'edit_file',
              inputText: 'src/main.ts',
            })

            schedule(() => {
              sessionEmitter.addToolResult({
                outputText: 'Edited src/main.ts',
              })
            }, 400)

            schedule(() => {
              sessionEmitter.addAssistantMessage({ text: 'Done.' })
            }, 800)

            schedule(() => {
              emitStatus('completed')
              emitAttention('finished')
            }, 1000)
          })
        }, 1500)
      }, 50)

      return {
        onDelta: (cb) => {
          listeners.delta.push(cb)
        },
        onStatusChange: (cb) => {
          listeners.status.push(cb)
        },
        onAttentionChange: (cb) => {
          listeners.attention.push(cb)
        },
        onContextWindowChange: (cb) => {
          listeners.contextWindow.push(cb)
        },
        onActivityChange: (cb) => {
          listeners.activity.push(cb)
        },
        onContinuationToken: () => {},
        sendMessage: (text) => {
          if (stopped) return
          sessionEmitter.addUserMessage({ text })
        },
        approve: () => {
          approveResolve?.()
          approveResolve = null
        },
        deny: () => {
          if (stopped) return
          approveResolve = null
          sessionEmitter.addNote({
            text: 'User denied the action.',
            level: 'info',
          })
          emitStatus('completed')
          emitAttention('finished')
        },
        stop: () => {
          stopped = true
          timers.forEach(clearTimeout)
          timers.length = 0
          approveResolve = null
          emitStatus('failed')
          emitAttention('failed')
        },
      }
    },
  }
}

describe('SessionService', () => {
  let service: SessionService
  let tempDir: string
  let projectId: string

  beforeEach(() => {
    vi.useFakeTimers()
    const db = getDatabase()
    const registry = new ProviderRegistry()
    registry.register(createTestProvider())

    service = new SessionService(db, registry)

    tempDir = mkdtempSync(join(tmpdir(), 'convergence-session-test-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))

    projectId = 'test-project'
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'test', ?)",
    ).run(projectId, repoPath)
  })

  afterEach(() => {
    vi.useRealTimers()
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates a session', () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'test session',
    })

    expect(session.id).toBeDefined()
    expect(session.name).toBe('test session')
    expect(session.status).toBe('idle')
    expect(session.attention).toBe('none')
    expect(session.contextWindow).toBeNull()
    expect(session.activity).toBeNull()
    expect(session.archivedAt).toBeNull()
    expect(session.lastSequence).toBe(0)
  })

  it('lists sessions by project', () => {
    service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'session 1',
    })
    service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'session 2',
    })

    const sessions = service.getByProjectId(projectId)
    expect(sessions).toHaveLength(2)
  })

  it('lists normalized session summaries without transcript payloads', () => {
    service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'summary target',
    })

    const [summary] = service.getSummariesByProjectId(projectId)

    expect(summary).toMatchObject({
      projectId,
      providerId: 'test-provider',
      continuationToken: null,
      lastSequence: 0,
    })
    expect('transcript' in summary).toBe(false)
  })

  it('captures activity while running and clears on completion', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'activity test',
    })

    service.start(session.id, { text: 'Go' })
    await vi.advanceTimersByTimeAsync(200)
    expect(service.getById(session.id)!.activity).toBe('streaming')

    await vi.advanceTimersByTimeAsync(1800)
    service.approve(session.id)
    await vi.advanceTimersByTimeAsync(2000)
    expect(service.getById(session.id)!.status).toBe('completed')
    expect(service.getById(session.id)!.activity).toBeNull()
  })

  it('starts a session and receives normalized conversation items', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'streaming test',
    })

    service.start(session.id, { text: 'Fix the bug' })
    await vi.advanceTimersByTimeAsync(1200)

    const updated = service.getById(session.id)!
    const conversation = service.getConversation(session.id)
    expect(updated.status).toBe('running')
    expect(conversation.length).toBeGreaterThanOrEqual(2)
    expect(updated.lastSequence).toBe(conversation.length)
    expect(conversation[0]).toMatchObject({
      kind: 'message',
      actor: 'user',
      text: 'Fix the bug',
      sequence: 1,
    })
    expect(conversation[1]).toMatchObject({
      kind: 'message',
      actor: 'assistant',
    })
  })

  it('patches streaming assistant text into a single conversation item', async () => {
    const db = getDatabase()
    const registry = new ProviderRegistry()

    const provider: Provider = {
      id: 'streaming-provider',
      name: 'Streaming Provider',
      supportsContinuation: false,
      describe: async () => ({
        id: 'streaming-provider',
        name: 'Streaming Provider',
        vendorLabel: 'Test',
        kind: 'conversation',
        supportsContinuation: false,
        defaultModelId: 'stream-model',
        modelOptions: [
          {
            id: 'stream-model',
            label: 'Stream Model',
            defaultEffort: null,
            effortOptions: [],
          },
        ],
        attachments: TEST_ATTACHMENT_CAPABILITY,
        midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
      }),
      start: (config) => {
        let deltaListener: ((delta: SessionDelta) => void) | null = null
        setTimeout(() => {
          const assistantId = 'assistant-stream-1'
          deltaListener?.({
            kind: 'conversation.item.add',
            item: {
              id: 'user-1',
              turnId: null,
              kind: 'message',
              state: 'complete',
              actor: 'user',
              text: config.initialMessage,
              createdAt: now(),
              updatedAt: now(),
              providerMeta: {
                providerId: 'streaming-provider',
                providerItemId: null,
                providerEventType: 'user',
              },
            },
          })
          deltaListener?.({
            kind: 'conversation.item.add',
            item: {
              id: assistantId,
              turnId: null,
              kind: 'message',
              state: 'streaming',
              actor: 'assistant',
              text: 'Hello',
              createdAt: now(),
              updatedAt: now(),
              providerMeta: {
                providerId: 'streaming-provider',
                providerItemId: null,
                providerEventType: 'stream',
              },
            },
          })
          deltaListener?.({
            kind: 'conversation.item.patch',
            itemId: assistantId,
            patch: {
              text: 'Hello world',
              state: 'complete',
              updatedAt: now(),
            },
          })
          deltaListener?.({
            kind: 'session.patch',
            patch: {
              status: 'completed',
              attention: 'finished',
            },
          })
        }, 0)

        return {
          onDelta: (listener) => {
            deltaListener = listener
          },
          onStatusChange: () => {},
          onAttentionChange: () => {},
          onContinuationToken: () => {},
          onContextWindowChange: () => {},
          onActivityChange: () => {},
          sendMessage: () => {},
          approve: () => {},
          deny: () => {},
          stop: () => {},
        }
      },
    }

    registry.register(provider)
    const streamingService = new SessionService(db, registry)

    const session = streamingService.create({
      projectId,
      workspaceId: null,
      providerId: 'streaming-provider',
      model: 'stream-model',
      effort: null,
      name: 'stream reducer test',
    })

    await streamingService.start(session.id, { text: 'Say hello' })
    await vi.advanceTimersByTimeAsync(10)

    const conversation = streamingService.getConversation(session.id)
    const assistantItems = conversation.filter(
      (item) => item.kind === 'message' && item.actor === 'assistant',
    )

    expect(assistantItems).toHaveLength(1)
    expect(assistantItems[0]).toMatchObject({
      text: 'Hello world',
      state: 'complete',
    })
    expect(streamingService.getSummaryById(session.id)?.lastSequence).toBe(2)
    expect(conversation).toEqual([
      expect.objectContaining({
        kind: 'message',
        actor: 'user',
        text: 'Say hello',
      }),
      expect.objectContaining({
        kind: 'message',
        actor: 'assistant',
        text: 'Hello world',
      }),
    ])
  })

  it('transitions through approval flow', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'approval test',
    })

    service.start(session.id, { text: 'Do something' })
    await vi.advanceTimersByTimeAsync(2000)

    let updated = service.getById(session.id)!
    expect(updated.attention).toBe('needs-approval')

    service.approve(session.id)
    await vi.advanceTimersByTimeAsync(2000)

    updated = service.getById(session.id)!
    expect(updated.status).toBe('completed')
    expect(updated.attention).toBe('finished')
  })

  it('stops a running session', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'stop test',
    })

    service.start(session.id, { text: 'Do something' })
    await vi.advanceTimersByTimeAsync(500)

    service.stop(session.id)

    const updated = service.getById(session.id)!
    expect(updated.status).toBe('failed')
    expect(updated.attention).toBe('failed')
  })

  it('deletes a session', () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'delete test',
    })

    service.delete(session.id)
    expect(service.getById(session.id)).toBeNull()
  })

  it('archives and unarchives a session', () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'archive test',
    })

    service.archive(session.id)
    expect(service.getById(session.id)?.archivedAt).toBeTruthy()

    service.unarchive(session.id)
    expect(service.getById(session.id)?.archivedAt).toBeNull()
  })

  it('persists conversation items to database', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'persist test',
    })

    service.start(session.id, { text: 'Hello' })
    await vi.advanceTimersByTimeAsync(2000)
    service.approve(session.id)
    await vi.advanceTimersByTimeAsync(2000)

    const loaded = service.getById(session.id)!
    const conversation = service.getConversation(session.id)
    expect(conversation.length).toBeGreaterThan(3)
    expect(conversation.some((item) => item.kind === 'tool-call')).toBe(true)
    expect(conversation.some((item) => item.kind === 'tool-result')).toBe(true)
    expect(service.getSummaryById(session.id)?.lastSequence).toBe(
      conversation.length,
    )
    expect(loaded.contextWindow).toMatchObject({
      availability: 'available',
      usedTokens: 2048,
      windowTokens: 200000,
    })
  })

  it('notifies summary update listener on changes', async () => {
    const updates: string[] = []
    service.setSummaryUpdateListener((summary) => updates.push(summary.id))

    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'notify test',
    })

    service.start(session.id, { text: 'Go' })
    await vi.advanceTimersByTimeAsync(2000)

    expect(updates.length).toBeGreaterThan(0)
    expect(updates.every((id) => id === session.id)).toBe(true)
  })

  it('notifies the attention observer for provider session.patch transitions', async () => {
    const transitions: Array<{
      sessionId: string
      prev: AttentionState
      next: AttentionState
    }> = []
    service.setAttentionObserver({
      onAttentionTransition: (prev, next, session) => {
        transitions.push({ sessionId: session.id, prev, next })
      },
    })

    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'attention notify test',
    })

    service.start(session.id, { text: 'Go' })
    await vi.advanceTimersByTimeAsync(2000)

    expect(transitions).toContainEqual({
      sessionId: session.id,
      prev: 'none',
      next: 'needs-approval',
    })

    service.approve(session.id)
    await vi.advanceTimersByTimeAsync(2000)

    expect(transitions).toContainEqual({
      sessionId: session.id,
      prev: 'needs-approval',
      next: 'none',
    })
    expect(transitions).toContainEqual({
      sessionId: session.id,
      prev: 'none',
      next: 'finished',
    })
  })

  it('marks shell sessions finished when their last terminal exits cleanly', () => {
    const transitions: Array<{
      sessionId: string
      prev: AttentionState
      next: AttentionState
    }> = []
    service.setAttentionObserver({
      onAttentionTransition: (prev, next, session) => {
        transitions.push({ sessionId: session.id, prev, next })
      },
    })

    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'shell',
      model: null,
      effort: null,
      name: 'shell session',
      primarySurface: 'terminal',
    })

    service.markShellSessionExited(session.id, 0)

    expect(service.getById(session.id)).toMatchObject({
      status: 'completed',
      attention: 'finished',
    })
    expect(transitions).toContainEqual({
      sessionId: session.id,
      prev: 'none',
      next: 'finished',
    })
  })

  it('marks shell sessions failed when their last terminal exits non-zero', () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'shell',
      model: null,
      effort: null,
      name: 'shell failed',
      primarySurface: 'terminal',
    })

    service.markShellSessionExited(session.id, 23)

    expect(service.getById(session.id)).toMatchObject({
      status: 'failed',
      attention: 'failed',
    })
  })

  it('keeps continuation-capable sessions active after completion', async () => {
    const db = getDatabase()
    const registry = new ProviderRegistry()

    let deltaListener: ((delta: SessionDelta) => void) | null = null
    const sendMessage = vi.fn()

    const handle: SessionHandle = {
      onDelta: (listener) => {
        deltaListener = listener
      },
      onStatusChange: () => {},
      onAttentionChange: () => {},
      onContextWindowChange: () => {},
      onActivityChange: () => {},
      onContinuationToken: () => {},
      sendMessage,
      approve: () => {},
      deny: () => {},
      stop: () => {},
    }

    const provider: Provider = {
      id: 'continuable',
      name: 'Continuable Provider',
      supportsContinuation: true,
      describe: async () => ({
        id: 'continuable',
        name: 'Continuable Provider',
        vendorLabel: 'Test',
        kind: 'conversation',
        supportsContinuation: true,
        defaultModelId: 'continuable-model',
        modelOptions: [
          {
            id: 'continuable-model',
            label: 'Continuable Model',
            defaultEffort: null,
            effortOptions: [],
          },
        ],
        attachments: TEST_ATTACHMENT_CAPABILITY,
        midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
      }),
      start: () => handle,
    }

    registry.register(provider)

    const continuationService = new SessionService(db, registry)
    const session = continuationService.create({
      projectId,
      workspaceId: null,
      providerId: 'continuable',
      model: 'continuable-model',
      effort: null,
      name: 'continuation test',
    })

    await continuationService.start(session.id, { text: 'Start here' })
    expect(deltaListener).not.toBeNull()
    if (!deltaListener) {
      throw new Error('delta listener was not registered')
    }
    const emitDelta = deltaListener as (delta: SessionDelta) => void
    emitDelta({ kind: 'session.patch', patch: { status: 'completed' } })

    await expect(
      continuationService.sendMessage(session.id, { text: 'Follow up' }),
    ).resolves.not.toThrow()
    expect(sendMessage).toHaveBeenCalledWith(
      'Follow up',
      undefined,
      undefined,
      { deliveryMode: 'normal' },
    )
  })

  it('queues app-managed follow-up input while a provider is running', async () => {
    const db = getDatabase()
    const registry = new ProviderRegistry()
    let deltaListener: ((delta: SessionDelta) => void) | null = null
    const sendMessage = vi.fn()
    const handle: SessionHandle = {
      onDelta: (listener) => {
        deltaListener = listener
      },
      onStatusChange: () => {},
      onAttentionChange: () => {},
      onContextWindowChange: () => {},
      onActivityChange: () => {},
      onContinuationToken: () => {},
      sendMessage,
      approve: () => {},
      deny: () => {},
      stop: () => {},
    }

    const provider: Provider = {
      id: 'claude-code',
      name: 'Claude Code',
      supportsContinuation: true,
      describe: async () => ({
        id: 'claude-code',
        name: 'Claude Code',
        vendorLabel: 'Anthropic',
        kind: 'conversation',
        supportsContinuation: true,
        defaultModelId: 'sonnet',
        modelOptions: [
          {
            id: 'sonnet',
            label: 'Sonnet',
            defaultEffort: null,
            effortOptions: [],
          },
        ],
        attachments: TEST_ATTACHMENT_CAPABILITY,
        midRunInput: CLAUDE_CODE_MID_RUN_INPUT_CAPABILITY,
      }),
      start: () => handle,
    }

    registry.register(provider)
    const queueService = new SessionService(db, registry)
    const session = queueService.create({
      projectId,
      workspaceId: null,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: null,
      name: 'queue test',
    })

    await queueService.start(session.id, { text: 'Start here' })
    expect(deltaListener).not.toBeNull()
    if (!deltaListener) {
      throw new Error('delta listener was not registered')
    }
    const emitDelta = deltaListener as (delta: SessionDelta) => void
    emitDelta({ kind: 'session.patch', patch: { status: 'running' } })

    await queueService.sendMessage(session.id, {
      text: 'Do this after',
      deliveryMode: 'follow-up',
    })

    expect(sendMessage).not.toHaveBeenCalled()
    expect(queueService.getQueuedInputs(session.id)).toMatchObject([
      {
        sessionId: session.id,
        deliveryMode: 'follow-up',
        state: 'queued',
        text: 'Do this after',
      },
    ])

    emitDelta({ kind: 'session.patch', patch: { status: 'completed' } })

    expect(sendMessage).toHaveBeenCalledWith(
      'Do this after',
      undefined,
      [],
      expect.objectContaining({
        deliveryMode: 'normal',
        queuedInputId: expect.any(String),
      }),
    )
    expect(queueService.getQueuedInputs(session.id)).toEqual([])
  })

  it('cancels queued input only while it is still queued', () => {
    const db = getDatabase()
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'cancel queue test',
    })
    const timestamp = '2026-04-26T12:00:00.000Z'
    db.prepare(
      `INSERT INTO session_queued_inputs (
         id,
         session_id,
         delivery_mode,
         state,
         text,
         attachment_ids_json,
         skill_selections_json,
         provider_request_id,
         error,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'queued-1',
      session.id,
      'follow-up',
      'queued',
      'later',
      '[]',
      '[]',
      null,
      null,
      timestamp,
      timestamp,
    )

    service.cancelQueuedInput('queued-1')

    expect(service.getQueuedInputs(session.id)).toEqual([])
    expect(
      db
        .prepare('SELECT state FROM session_queued_inputs WHERE id = ?')
        .get('queued-1'),
    ).toEqual({ state: 'cancelled' })
  })

  it('marks stale dispatching queued input failed on startup', () => {
    const db = getDatabase()
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'stale queue test',
    })
    const timestamp = '2026-04-26T12:00:00.000Z'
    db.prepare(
      `INSERT INTO session_queued_inputs (
         id,
         session_id,
         delivery_mode,
         state,
         text,
         attachment_ids_json,
         skill_selections_json,
         provider_request_id,
         error,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'queued-stale',
      session.id,
      'follow-up',
      'dispatching',
      'later',
      '[]',
      '[]',
      null,
      null,
      timestamp,
      timestamp,
    )

    const registry = new ProviderRegistry()
    registry.register(createTestProvider())
    const restartedService = new SessionService(db, registry)

    expect(restartedService.getQueuedInputs(session.id)).toMatchObject([
      {
        id: 'queued-stale',
        state: 'failed',
        error: 'App restarted before this input was accepted.',
      },
    ])
  })

  it('rehydrates continuation-capable sessions after restart', async () => {
    const db = getDatabase()
    const startConfigs: Array<{
      initialMessage: string
      continuationToken: string | null
    }> = []

    const createContinuableProvider = (): Provider => ({
      id: 'continuable-rehydrate',
      name: 'Continuable Rehydrate Provider',
      supportsContinuation: true,
      describe: async () => ({
        id: 'continuable-rehydrate',
        name: 'Continuable Rehydrate Provider',
        vendorLabel: 'Test',
        kind: 'conversation',
        supportsContinuation: true,
        defaultModelId: 'continuable-model',
        modelOptions: [
          {
            id: 'continuable-model',
            label: 'Continuable Model',
            defaultEffort: null,
            effortOptions: [],
          },
        ],
        attachments: TEST_ATTACHMENT_CAPABILITY,
        midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
      }),
      start: (config) => {
        startConfigs.push({
          initialMessage: config.initialMessage,
          continuationToken: config.continuationToken,
        })

        let continuationListener: ((token: string) => void) | null = null
        let statusListener: ((status: SessionStatus) => void) | null = null
        let deltaListener: ((delta: SessionDelta) => void) | null = null

        setTimeout(() => {
          continuationListener?.('resume-token-1')
          statusListener?.('completed')
          deltaListener?.({
            kind: 'session.patch',
            patch: {
              continuationToken: 'resume-token-1',
              status: 'completed',
            },
          })
        }, 0)

        return {
          onDelta: (listener) => {
            deltaListener = listener
          },
          onStatusChange: (listener) => {
            statusListener = listener
          },
          onAttentionChange: () => {},
          onContextWindowChange: () => {},
          onActivityChange: () => {},
          onContinuationToken: (listener) => {
            continuationListener = listener
            if (config.continuationToken) {
              listener(config.continuationToken)
            }
          },
          sendMessage: () => {},
          approve: () => {},
          deny: () => {},
          stop: () => {},
        }
      },
    })

    const registry = new ProviderRegistry()
    registry.register(createContinuableProvider())

    const firstService = new SessionService(db, registry)
    const session = firstService.create({
      projectId,
      workspaceId: null,
      providerId: 'continuable-rehydrate',
      model: 'continuable-model',
      effort: null,
      name: 'rehydrate me',
    })

    await firstService.start(session.id, { text: 'Initial prompt' })
    await vi.advanceTimersByTimeAsync(1)

    const rehydratedRegistry = new ProviderRegistry()
    rehydratedRegistry.register(createContinuableProvider())
    const restartedService = new SessionService(db, rehydratedRegistry)

    await expect(
      restartedService.sendMessage(session.id, {
        text: 'Follow up after restart',
      }),
    ).resolves.not.toThrow()

    expect(startConfigs).toEqual([
      {
        initialMessage: 'Initial prompt',
        continuationToken: null,
      },
      {
        initialMessage: 'Follow up after restart',
        continuationToken: 'resume-token-1',
      },
    ])
  })

  it('auto-unarchives a session when it becomes actionable', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'auto-unarchive test',
    })

    service.start(session.id, { text: 'Do something' })
    await vi.advanceTimersByTimeAsync(500)

    service.archive(session.id)
    expect(service.getById(session.id)?.archivedAt).toBeTruthy()

    await vi.advanceTimersByTimeAsync(1500)

    const updated = service.getById(session.id)!
    expect(updated.attention).toBe('needs-approval')
    expect(updated.archivedAt).toBeNull()
  })
})

describe('SessionService attachments integration', () => {
  let service: SessionService
  let attachments: AttachmentsService
  let tempDir: string
  let attachmentsRoot: string
  let projectId: string
  const received: {
    initial?: Attachment[]
    send?: Attachment[]
  } = {}

  function createCapturingProvider(): Provider {
    return {
      id: 'capture',
      name: 'Capture',
      supportsContinuation: false,
      describe: async () => ({
        id: 'capture',
        name: 'Capture',
        vendorLabel: 'Test',
        kind: 'conversation',
        supportsContinuation: false,
        defaultModelId: 'm',
        modelOptions: [
          {
            id: 'm',
            label: 'M',
            defaultEffort: null,
            effortOptions: [],
          },
        ],
        attachments: TEST_ATTACHMENT_CAPABILITY,
        midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
      }),
      start(config) {
        received.initial = config.initialAttachments
        const deltaListeners: Array<(delta: SessionDelta) => void> = []
        const sessionEmitter = new ProviderSessionEmitter({
          providerId: 'capture',
          emitDelta: (delta) => {
            deltaListeners.forEach((cb) => cb(delta))
          },
          now,
        })
        setTimeout(() => {
          sessionEmitter.addUserMessage({ text: config.initialMessage })
        }, 0)
        return {
          onDelta: (cb) => {
            deltaListeners.push(cb)
          },
          onStatusChange: () => {},
          onAttentionChange: () => {},
          onContinuationToken: () => {},
          onContextWindowChange: () => {},
          onActivityChange: () => {},
          sendMessage: (text, atts) => {
            received.send = atts
            sessionEmitter.addUserMessage({ text })
          },
          approve: () => {},
          deny: () => {},
          stop: () => {},
        }
      },
    }
  }

  beforeEach(() => {
    vi.useRealTimers()
    const db = getDatabase()
    const registry = new ProviderRegistry()
    registry.register(createCapturingProvider())

    tempDir = mkdtempSync(join(tmpdir(), 'convergence-session-attach-'))
    attachmentsRoot = join(tempDir, 'attachments')
    mkdirSync(attachmentsRoot)

    service = new SessionService(db, registry)
    attachments = new AttachmentsService(db, attachmentsRoot)
    service.setAttachmentsService(attachments)

    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))

    projectId = 'attach-project'
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 'a', ?)",
    ).run(projectId, repoPath)

    received.initial = undefined
    received.send = undefined
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  const PNG_BYTES = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  ])

  async function seedImage(sessionId: string): Promise<string> {
    const result = await attachments.ingestFiles(sessionId, [
      { name: 'img.png', bytes: PNG_BYTES },
    ])
    return result.attachments[0]!.id
  }

  it('resolves attachment ids and threads to provider start', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'capture',
      model: 'm',
      effort: null,
      name: 's',
    })

    const id = await seedImage(session.id)
    service.start(session.id, { text: 'hi', attachmentIds: [id] })
    await new Promise((r) => setTimeout(r, 10))

    expect(received.initial).toBeDefined()
    expect(received.initial?.[0]?.id).toBe(id)
  })

  it('persists attachmentIds on the user conversation item', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'capture',
      model: 'm',
      effort: null,
      name: 's2',
    })

    const id = await seedImage(session.id)
    service.start(session.id, { text: 'hi', attachmentIds: [id] })
    await new Promise((r) => setTimeout(r, 10))

    const conversation = service.getConversation(session.id)
    const userEntry = conversation.find(
      (entry) => entry.kind === 'message' && entry.actor === 'user',
    )
    expect(userEntry).toMatchObject({ attachmentIds: [id] })
  })

  it('persists selected skills on the user conversation item', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'capture',
      model: 'm',
      effort: null,
      name: 's-skills',
    })

    const skillSelections = [
      {
        id: 'codex:global:planning',
        providerId: 'codex' as const,
        providerName: 'Codex',
        name: 'planning',
        displayName: 'Planning',
        path: '/skills/planning/SKILL.md',
        scope: 'global' as const,
        rawScope: null,
        sourceLabel: 'Global',
        status: 'selected' as const,
      },
    ]
    service.start(session.id, { text: 'hi', skillSelections })
    await new Promise((r) => setTimeout(r, 10))

    const conversation = service.getConversation(session.id)
    const userEntry = conversation.find(
      (entry) => entry.kind === 'message' && entry.actor === 'user',
    )
    expect(userEntry).toMatchObject({ skillSelections })
  })

  it('cascades attachment cleanup on session delete', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'capture',
      model: 'm',
      effort: null,
      name: 's3',
    })

    const id = await seedImage(session.id)
    expect(attachments.getById(id)).not.toBeNull()

    service.delete(session.id)
    await new Promise((r) => setTimeout(r, 20))

    expect(attachments.getById(id)).toBeNull()
  })

  it('throws on start if an attachment id is unknown', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'capture',
      model: 'm',
      effort: null,
      name: 's4',
    })

    await expect(
      service.start(session.id, {
        text: 'hi',
        attachmentIds: ['does-not-exist'],
      }),
    ).rejects.toThrow(/Attachment\(s\) not found/)
  })

  describe('primary surface', () => {
    it('persists primarySurface on create and exposes it on the summary', () => {
      const session = service.create({
        projectId,
        workspaceId: null,
        providerId: 'shell',
        model: null,
        effort: null,
        name: 'terminal',
        primarySurface: 'terminal',
      })
      expect(session.primarySurface).toBe('terminal')

      const reloaded = service.getSummaryById(session.id)
      expect(reloaded?.primarySurface).toBe('terminal')
    })

    it('setPrimarySurface flips the stored value and broadcasts the update', () => {
      const summaries: Array<{ id: string; primarySurface: string }> = []
      service.setSummaryUpdateListener((summary) => {
        summaries.push({
          id: summary.id,
          primarySurface: summary.primarySurface,
        })
      })

      const session = service.create({
        projectId,
        workspaceId: null,
        providerId: 'test-provider',
        model: 'test-model',
        effort: null,
        name: 'convo',
      })
      expect(session.primarySurface).toBe('conversation')

      const flipped = service.setPrimarySurface(session.id, 'terminal')
      expect(flipped.primarySurface).toBe('terminal')
      expect(summaries.at(-1)).toEqual({
        id: session.id,
        primarySurface: 'terminal',
      })
    })

    it('setPrimarySurface refuses to flip a shell session to conversation without a real provider', () => {
      const session = service.create({
        projectId,
        workspaceId: null,
        providerId: 'shell',
        model: null,
        effort: null,
        name: 'terminal',
        primarySurface: 'terminal',
      })
      expect(() =>
        service.setPrimarySurface(session.id, 'conversation'),
      ).toThrow(/shell provider/)
    })

    it('sendMessage rejects sessions that use the shell provider', async () => {
      const session = service.create({
        projectId,
        workspaceId: null,
        providerId: 'shell',
        model: null,
        effort: null,
        name: 'terminal',
        primarySurface: 'terminal',
      })
      await expect(
        service.sendMessage(session.id, { text: 'hello' }),
      ).rejects.toThrow(/shell provider/)
    })
  })
})

describe('SessionService — turn capture wiring', () => {
  let service: SessionService
  let tempDir: string
  let repoPath: string
  let projectId: string
  let capture: import('./turn/turn-capture.service').TurnCaptureService
  let triggerCompletion: (() => void) | null

  async function waitFor(
    predicate: () => boolean,
    timeoutMs = 1_000,
  ): Promise<void> {
    const startedAt = Date.now()
    while (!predicate() && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  function createQuietProvider(): Provider {
    return {
      id: 'quiet-provider',
      name: 'Quiet Provider',
      supportsContinuation: false,
      describe: async () => ({
        id: 'quiet-provider',
        name: 'Quiet Provider',
        vendorLabel: 'Quiet',
        kind: 'conversation',
        supportsContinuation: false,
        defaultModelId: 'quiet',
        modelOptions: [
          {
            id: 'quiet',
            label: 'Quiet',
            defaultEffort: null,
            effortOptions: [],
          },
        ],
        attachments: TEST_ATTACHMENT_CAPABILITY,
        midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
      }),
      start(config) {
        const listeners = {
          delta: [] as Array<(delta: SessionDelta) => void>,
          status: [] as Array<(status: SessionStatus) => void>,
          attention: [] as Array<(attention: AttentionState) => void>,
          contextWindow: [] as Array<
            (contextWindow: SessionContextWindow) => void
          >,
          activity: [] as Array<(activity: ActivitySignal) => void>,
        }
        const emitDelta = (delta: SessionDelta) =>
          listeners.delta.forEach((cb) => cb(delta))
        const sessionEmitter = new ProviderSessionEmitter({
          providerId: 'quiet-provider',
          emitDelta,
          now,
        })
        let stopped = false

        setTimeout(() => {
          if (stopped) return
          listeners.status.forEach((cb) => cb('running'))
          sessionEmitter.patchSession({ status: 'running' })
          sessionEmitter.addUserMessage({ text: config.initialMessage })
          setTimeout(() => {
            if (stopped) return
            sessionEmitter.addAssistantMessage({
              text: 'Working on it',
              state: 'complete',
            })
          }, 5)
        }, 0)

        triggerCompletion = () => {
          if (stopped) return
          listeners.status.forEach((cb) => cb('completed'))
          listeners.attention.forEach((cb) => cb('finished'))
          sessionEmitter.patchSession({
            status: 'completed',
            attention: 'finished',
          })
        }

        return {
          onDelta: (cb) => listeners.delta.push(cb),
          onStatusChange: (cb) => listeners.status.push(cb),
          onAttentionChange: (cb) => listeners.attention.push(cb),
          onContextWindowChange: (cb) => listeners.contextWindow.push(cb),
          onActivityChange: (cb) => listeners.activity.push(cb),
          onContinuationToken: () => {},
          sendMessage: (text) => {
            if (stopped) return
            sessionEmitter.addUserMessage({ text })
          },
          approve: () => {},
          deny: () => {},
          stop: () => {
            stopped = true
            listeners.status.forEach((cb) => cb('failed'))
            listeners.attention.forEach((cb) => cb('failed'))
            sessionEmitter.patchSession({
              status: 'failed',
              attention: 'failed',
            })
          },
        }
      },
    }
  }

  beforeEach(async () => {
    vi.useRealTimers()
    triggerCompletion = null
    const { execFileSync } = await import('child_process')
    const db = getDatabase()
    const registry = new ProviderRegistry()
    registry.register(createQuietProvider())

    tempDir = mkdtempSync(join(tmpdir(), 'convergence-session-turn-'))
    repoPath = join(tempDir, 'repo')
    execFileSync('git', ['init', '-q', repoPath])
    execFileSync('git', ['config', 'user.email', 'test@test.com'], {
      cwd: repoPath,
    })
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoPath })
    execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], {
      cwd: repoPath,
    })

    projectId = 'turn-project'
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES (?, 't', ?)",
    ).run(projectId, repoPath)

    const { GitService } = await import('../git/git.service')
    const { TurnCaptureService } = await import('./turn/turn-capture.service')
    capture = new TurnCaptureService(new GitService(), db, { debounceMs: 0 })

    service = new SessionService(db, registry)
    service.setTurnCaptureService(capture)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates a turn on start and closes it when status reaches completed', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'quiet-provider',
      model: 'quiet',
      effort: null,
      name: 'turn test',
    })

    await service.start(session.id, { text: 'Do the thing' })
    await new Promise((resolve) => setTimeout(resolve, 150))

    const turnsMid = capture.listTurns(session.id)
    expect(turnsMid).toHaveLength(1)
    expect(turnsMid[0].status).toBe('running')

    triggerCompletion!()
    await new Promise((resolve) => setTimeout(resolve, 10))
    await capture.flushPendingEnd(session.id)

    const turnsEnd = capture.listTurns(session.id)
    expect(turnsEnd).toHaveLength(1)
    expect(turnsEnd[0].status).toBe('completed')
    expect(turnsEnd[0].endedAt).not.toBeNull()
  })

  it('stamps all conversation items in a turn with a consistent turnId', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'quiet-provider',
      model: 'quiet',
      effort: null,
      name: 'stamp test',
    })

    await service.start(session.id, { text: 'Hello there' })
    await new Promise((resolve) => setTimeout(resolve, 150))

    const convo = service.getConversation(session.id)
    const userItems = convo.filter(
      (item) => item.kind === 'message' && item.actor === 'user',
    )
    expect(userItems).toHaveLength(1)
    const turnId = userItems[0].turnId
    expect(turnId).not.toBeNull()
    for (const item of convo) {
      expect(item.turnId).toBe(turnId)
    }
  })

  it('emits turn deltas through the registered listener', async () => {
    const observed: Array<{ sessionId: string; kind: string }> = []
    service.setTurnDeltaListener((sessionId, delta) => {
      observed.push({ sessionId, kind: delta.kind })
    })

    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'quiet-provider',
      model: 'quiet',
      effort: null,
      name: 'delta test',
    })

    await service.start(session.id, { text: 'hi' })
    await waitFor(() => observed.some((d) => d.kind === 'turn.add'))

    expect(observed.some((d) => d.kind === 'turn.add')).toBe(true)
    expect(observed.every((d) => d.sessionId === session.id)).toBe(true)
  })

  it('closes the active turn as errored on stop()', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'quiet-provider',
      model: 'quiet',
      effort: null,
      name: 'stop test',
    })

    await service.start(session.id, { text: 'hi' })
    await new Promise((resolve) => setTimeout(resolve, 150))

    service.stop(session.id)
    await capture.flushPendingEnd(session.id)

    const turns = capture.listTurns(session.id)
    expect(turns).toHaveLength(1)
    expect(turns[0].status).toBe('errored')
  })

  it('recovers leftover running turns on boot', () => {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
       VALUES ('rec1', ?, 'quiet-provider', 's', ?)`,
    ).run(projectId, repoPath)
    db.prepare(
      `INSERT INTO session_turns (id, session_id, sequence, started_at, status)
       VALUES ('stale-turn', 'rec1', 1, '2026-04-23T00:00:00.000Z', 'running')`,
    ).run()

    capture.recoverRunningTurns()

    const turns = capture.listTurns('rec1')
    expect(turns[0].status).toBe('errored')
    expect(turns[0].endedAt).not.toBeNull()
  })
})
