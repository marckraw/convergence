import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import type {
  Provider,
  SessionHandle,
  SessionStatus,
  TranscriptEntry,
  AttentionState,
} from '../provider/provider.types'
import { SessionService } from './session.service'

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
    }),
    start(config) {
      const listeners = {
        transcript: [] as Array<(entry: TranscriptEntry) => void>,
        status: [] as Array<(status: SessionStatus) => void>,
        attention: [] as Array<(attention: AttentionState) => void>,
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

  it('starts a session and receives transcript entries', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'streaming test',
    })

    service.start(session.id, 'Fix the bug')
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

    service.start(session.id, 'Do something')
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

    service.start(session.id, 'Do something')
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

  it('persists transcript to database', async () => {
    const session = service.create({
      projectId,
      workspaceId: null,
      providerId: 'test-provider',
      model: 'test-model',
      effort: null,
      name: 'persist test',
    })

    service.start(session.id, 'Hello')
    await vi.advanceTimersByTimeAsync(2000)
    service.approve(session.id)
    await vi.advanceTimersByTimeAsync(2000)

    const loaded = service.getById(session.id)!
    expect(loaded.transcript.length).toBeGreaterThan(3)
    expect(loaded.transcript.some((e) => e.type === 'tool-use')).toBe(true)
    expect(loaded.transcript.some((e) => e.type === 'tool-result')).toBe(true)
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

    service.start(session.id, 'Go')
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

    continuationService.start(session.id, 'Start here')
    expect(statusListener).not.toBeNull()
    ;(statusListener as unknown as (status: SessionStatus) => void)('completed')

    expect(() =>
      continuationService.sendMessage(session.id, 'Follow up'),
    ).not.toThrow()
    expect(sendMessage).toHaveBeenCalledWith('Follow up')
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

    firstService.start(session.id, 'Initial prompt')
    await vi.advanceTimersByTimeAsync(1)

    const rehydratedRegistry = new ProviderRegistry()
    rehydratedRegistry.register(createContinuableProvider())
    const restartedService = new SessionService(db, rehydratedRegistry)

    expect(() =>
      restartedService.sendMessage(session.id, 'Follow up after restart'),
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
})
