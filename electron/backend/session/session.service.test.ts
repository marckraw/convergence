import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import type {
  ActivitySignal,
  Attachment,
  Provider,
  SessionHandle,
  SessionStatus,
  TranscriptEntry,
  AttentionState,
  SessionContextWindow,
} from '../provider/provider.types'
import type { ProviderAttachmentCapability } from '../provider/provider.types'
import { AttachmentsService } from '../attachments/attachments.service'
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
    }),
    start(config) {
      const listeners = {
        transcript: [] as Array<(entry: TranscriptEntry) => void>,
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

      const emitTranscript = (entry: TranscriptEntry) => {
        listeners.transcript.forEach((cb) => cb(entry))
      }

      const emitStatus = (status: SessionStatus) => {
        listeners.status.forEach((cb) => cb(status))
      }

      const emitAttention = (attention: AttentionState) => {
        listeners.attention.forEach((cb) => cb(attention))
      }

      const emitContextWindow = (contextWindow: SessionContextWindow) => {
        listeners.contextWindow.forEach((cb) => cb(contextWindow))
      }

      const emitActivity = (activity: ActivitySignal) => {
        listeners.activity.forEach((cb) => cb(activity))
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
        emitTranscript({
          type: 'user',
          text: config.initialMessage,
          timestamp: now(),
        })

        schedule(() => {
          emitTranscript({
            type: 'assistant',
            text: 'Starting analysis...',
            timestamp: now(),
          })
        }, 300)

        schedule(() => {
          emitTranscript({
            type: 'assistant',
            text: 'Preparing an edit.',
            timestamp: now(),
          })
        }, 800)

        schedule(() => {
          emitTranscript({
            type: 'approval-request',
            description: 'Edit src/main.ts',
            timestamp: now(),
          })
          emitAttention('needs-approval')

          new Promise<void>((resolve) => {
            approveResolve = resolve
          }).then(() => {
            if (stopped) return
            emitAttention('none')

            emitTranscript({
              type: 'tool-use',
              tool: 'edit_file',
              input: 'src/main.ts',
              timestamp: now(),
            })

            schedule(() => {
              emitTranscript({
                type: 'tool-result',
                result: 'Edited src/main.ts',
                timestamp: now(),
              })
            }, 400)

            schedule(() => {
              emitTranscript({
                type: 'assistant',
                text: 'Done.',
                timestamp: now(),
              })
            }, 800)

            schedule(() => {
              emitStatus('completed')
              emitAttention('finished')
            }, 1000)
          })
        }, 1500)
      }, 50)

      return {
        onTranscriptEntry: (cb) => {
          listeners.transcript.push(cb)
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
          emitTranscript({ type: 'user', text, timestamp: now() })
        },
        approve: () => {
          approveResolve?.()
          approveResolve = null
        },
        deny: () => {
          if (stopped) return
          approveResolve = null
          emitTranscript({
            type: 'system',
            text: 'User denied the action.',
            timestamp: now(),
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
    expect(session.transcript).toEqual([])
    expect(session.contextWindow).toBeNull()
    expect(session.activity).toBeNull()
    expect(session.archivedAt).toBeNull()
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

  it('captures activity while running and clears on completion', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'activity test',
    })

    service.start(session.id, 'Go')
    await vi.advanceTimersByTimeAsync(200)
    expect(service.getById(session.id)!.activity).toBe('streaming')

    await vi.advanceTimersByTimeAsync(1800)
    service.approve(session.id)
    await vi.advanceTimersByTimeAsync(2000)
    expect(service.getById(session.id)!.status).toBe('completed')
    expect(service.getById(session.id)!.activity).toBeNull()
  })

  it('starts a session and receives transcript entries', async () => {
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
    expect(updated.status).toBe('running')
    expect(updated.transcript.length).toBeGreaterThanOrEqual(2)
    expect(updated.transcript[0]).toMatchObject({
      type: 'user',
      text: 'Fix the bug',
    })
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

  it('persists transcript to database', async () => {
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
    expect(loaded.transcript.length).toBeGreaterThan(3)
    expect(loaded.transcript.some((e) => e.type === 'tool-use')).toBe(true)
    expect(loaded.transcript.some((e) => e.type === 'tool-result')).toBe(true)
    expect(loaded.contextWindow).toMatchObject({
      availability: 'available',
      usedTokens: 2048,
      windowTokens: 200000,
    })
  })

  it('notifies update listener on changes', async () => {
    const updates: string[] = []
    service.setUpdateListener((session) => updates.push(session.id))

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

  it('keeps continuation-capable sessions active after completion', () => {
    const db = getDatabase()
    const registry = new ProviderRegistry()

    let statusListener: ((status: SessionStatus) => void) | null = null
    const sendMessage = vi.fn()

    const handle: SessionHandle = {
      onTranscriptEntry: () => {},
      onStatusChange: (listener) => {
        statusListener = listener
      },
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

    continuationService.start(session.id, { text: 'Start here' })
    expect(statusListener).not.toBeNull()
    ;(statusListener as unknown as (status: SessionStatus) => void)('completed')

    expect(() =>
      continuationService.sendMessage(session.id, { text: 'Follow up' }),
    ).not.toThrow()
    expect(sendMessage).toHaveBeenCalledWith('Follow up', undefined)
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
      }),
      start: (config) => {
        startConfigs.push({
          initialMessage: config.initialMessage,
          continuationToken: config.continuationToken,
        })

        let continuationListener: ((token: string) => void) | null = null
        let statusListener: ((status: SessionStatus) => void) | null = null

        setTimeout(() => {
          continuationListener?.('resume-token-1')
          statusListener?.('completed')
        }, 0)

        return {
          onTranscriptEntry: () => {},
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

    firstService.start(session.id, { text: 'Initial prompt' })
    await vi.advanceTimersByTimeAsync(1)

    const rehydratedRegistry = new ProviderRegistry()
    rehydratedRegistry.register(createContinuableProvider())
    const restartedService = new SessionService(db, rehydratedRegistry)

    expect(() =>
      restartedService.sendMessage(session.id, {
        text: 'Follow up after restart',
      }),
    ).not.toThrow()

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
      }),
      start(config) {
        received.initial = config.initialAttachments
        const transcriptListeners: Array<(entry: TranscriptEntry) => void> = []
        setTimeout(() => {
          transcriptListeners.forEach((cb) =>
            cb({ type: 'user', text: config.initialMessage, timestamp: now() }),
          )
        }, 0)
        return {
          onTranscriptEntry: (cb) => {
            transcriptListeners.push(cb)
          },
          onStatusChange: () => {},
          onAttentionChange: () => {},
          onContinuationToken: () => {},
          onContextWindowChange: () => {},
          onActivityChange: () => {},
          sendMessage: (text, atts) => {
            received.send = atts
            transcriptListeners.forEach((cb) =>
              cb({ type: 'user', text, timestamp: now() }),
            )
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

  it('persists attachmentIds on the user transcript entry', async () => {
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

    const loaded = service.getById(session.id)!
    const userEntry = loaded.transcript.find((e) => e.type === 'user') as {
      type: 'user'
      text: string
      attachmentIds?: string[]
    }
    expect(userEntry.attachmentIds).toEqual([id])
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

    expect(() =>
      service.start(session.id, {
        text: 'hi',
        attachmentIds: ['does-not-exist'],
      }),
    ).toThrow(/Attachment\(s\) not found/)
  })
})
