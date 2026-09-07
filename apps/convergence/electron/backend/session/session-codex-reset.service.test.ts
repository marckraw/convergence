import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { buildFallbackCodexDescriptor } from '../provider/provider-descriptor.pure'
import type { SessionStartConfig } from '../provider/provider.types'
import type { SessionDelta } from './conversation-item.types'
import { ProjectContextService } from '../project-context/project-context.service'
import { SessionContextInjectionService } from './context-injection/session-context-injection.service'
import { SessionService } from './session.service'

/** Public session-service door: injection and queuing happen before the adapter. */
describe('Codex reset through the composer door', () => {
  let service: SessionService
  let directory: string
  let sessionId: string
  let contextId: string
  let emit: (delta: SessionDelta) => void
  let starts: SessionStartConfig[]
  beforeEach(() => {
    const db = getDatabase()
    directory = mkdtempSync(join(tmpdir(), 'codex-reset-'))
    mkdirSync(join(directory, '.git'))
    db.prepare(
      'INSERT INTO projects (id, name, repository_path) VALUES (?, ?, ?)',
    ).run('reset-project', 'Reset', directory)
    const registry = new ProviderRegistry()
    starts = []
    registry.register({
      id: 'codex',
      name: 'Codex',
      supportsContinuation: true,
      describe: async () => buildFallbackCodexDescriptor(),
      start(config) {
        starts.push(config)
        return {
          onDelta: (cb) => {
            emit = cb
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
          dispose: () => {},
        }
      },
    })
    service = new SessionService(db, new LocalExecutionHost(registry))
    const context = new ProjectContextService(db)
    service.setSessionContextInjectionService(
      new SessionContextInjectionService(db, context),
    )
    contextId = context.create({
      projectId: 'reset-project',
      label: 'always',
      body: 'injected context',
      reinjectMode: 'every-turn',
    }).id
    sessionId = service.create({
      projectId: 'reset-project',
      workspaceId: null,
      providerId: 'codex',
      name: 'same',
      model: 'gpt-6',
      effort: 'high',
    }).id
  })
  afterEach(() => {
    service.disposeAll()
    closeDatabase()
    resetDatabase()
    rmSync(directory, { recursive: true, force: true })
  })

  it('passes a resumed /clear unchanged — remove reset injection bypass turns red', async () => {
    await service.start(sessionId, {
      text: 'before',
      contextItemIds: [contextId],
    })
    emit({
      kind: 'session.patch',
      patch: { continuationToken: 'old-thread', status: 'completed' },
    })
    await service.sendMessage(sessionId, { text: '/clear' })
    expect(starts.map((config) => config.initialMessage)).toEqual([
      '<reset:context>\nalways\ninjected context\n</reset:context>\n\nbefore',
      '/clear',
    ])
  })
  it('refuses a running composer reset — remove the pre-queue reset guard turns red', async () => {
    await service.start(sessionId, {
      text: 'before',
      contextItemIds: [contextId],
    })
    emit({ kind: 'session.patch', patch: { status: 'running' } })
    await expect(
      service.sendMessage(sessionId, { text: '/clear' }),
    ).rejects.toThrow(
      'Wait for the current turn to finish before clearing the conversation.',
    )
  })

  it('passes a first /clear unchanged — remove reset boot bypass turns red', async () => {
    await service.start(sessionId, {
      text: '/clear',
      contextItemIds: [contextId],
    })
    expect(starts[0].initialMessage).toBe('/clear')
  })
})
