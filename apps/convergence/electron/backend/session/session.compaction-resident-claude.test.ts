import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { NO_MID_RUN_INPUT_CAPABILITY } from '../provider/provider-descriptor.pure'
import { ProviderRegistry } from '../provider/provider-registry'
import type {
  Provider,
  ProviderAttachmentCapability,
  SessionHandle,
  SessionStatus,
} from '../provider/provider.types'
import type { SessionDelta } from './conversation-item.types'
import { SessionService } from './session.service'

/**
 * The compact button on a Claude conversation that answered a moment ago
 * (MAR-3243).
 *
 * Claude's handle is `resident: true`, and a resident handle is NOT released
 * when its turn completes -- its process lives on for the idle window. So a
 * door that asks "is a handle attached?" reads an idle Claude session as busy
 * for up to half an hour after every answer. This file drives the service's
 * own `compactContext` through a stub provider shaped like Claude's: a
 * resident handle whose turn has completed.
 */

const ATTACHMENTS: ProviderAttachmentCapability = {
  supportsImage: true,
  supportsPdf: true,
  supportsText: true,
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 20 * 1024 * 1024,
  maxTextBytes: 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
}

interface ResidentFixture {
  provider: Provider
  /** Every call the service made on the provider, in the order it made them. */
  calls: string[]
  manageContext: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  /** Speaks for the live handle, the way the Claude adapter's emitter does. */
  emit: (delta: SessionDelta) => void
}

function createResidentClaudeFixture(): ResidentFixture {
  const calls: string[] = []
  let listener: ((delta: SessionDelta) => void) | null = null

  const dispose = vi.fn(() => {
    calls.push('dispose')
  })
  const manageContext = vi.fn(async () => {
    calls.push('manageContext')
    return {
      kind: 'compact' as const,
      contextWindow: {
        availability: 'unavailable' as const,
        source: 'provider' as const,
        reason: 'Context compacted.',
      },
    }
  })

  const handle: SessionHandle = {
    // The one fact this file is about.
    resident: true,
    onDelta: (callback) => {
      listener = callback
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
    dispose,
  }

  const provider: Provider = {
    id: 'resident-claude',
    name: 'Resident Claude',
    supportsContinuation: true,
    describe: async () => ({
      id: 'resident-claude',
      name: 'Resident Claude',
      vendorLabel: 'Test',
      kind: 'conversation',
      supportsContinuation: true,
      supportsConversationReset: false,
      defaultModelId: 'model',
      modelOptions: [
        { id: 'model', label: 'Model', defaultEffort: null, effortOptions: [] },
      ],
      attachments: ATTACHMENTS,
      midRunInput: NO_MID_RUN_INPUT_CAPABILITY,
    }),
    manageContext,
    start: () => handle,
  }

  return {
    provider,
    calls,
    manageContext,
    dispose,
    emit: (delta) => {
      if (!listener) throw new Error('delta listener was not registered')
      listener(delta)
    },
  }
}

describe('compacting a Claude session whose resident handle is still attached', () => {
  let db: Database.Database
  let service: SessionService
  let fixture: ResidentFixture
  let tempDir: string
  let sessionId: string

  beforeEach(async () => {
    db = getDatabase()
    fixture = createResidentClaudeFixture()
    const registry = new ProviderRegistry()
    registry.register(fixture.provider)

    tempDir = mkdtempSync(join(tmpdir(), 'convergence-resident-compaction-'))
    const repoPath = join(tempDir, 'repo')
    mkdirSync(repoPath)
    mkdirSync(join(repoPath, '.git'))
    service = new SessionService(
      db,
      new LocalExecutionHost(registry),
      join(tempDir, 'global-sessions'),
    )
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p', 'fixture', ?)",
    ).run(repoPath)
    sessionId = service.create({
      projectId: 'p',
      workspaceId: null,
      providerId: 'resident-claude',
      name: 'Resident conversation',
      model: 'model',
      effort: null,
    }).id
    await service.start(sessionId, { text: 'first' })
    fixture.emit({
      kind: 'session.patch',
      patch: { continuationToken: 'claude-session-1' },
    })
  })

  afterEach(async () => {
    await service.disposeAll()
    closeDatabase()
    resetDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  /** The turn ends the way a Claude turn ends: the row settles, the process stays. */
  function settle(status: SessionStatus): void {
    fixture.emit({
      kind: 'session.patch',
      patch: { status, attention: 'finished' },
    })
  }

  it('compacts after the turn completed, with the resident process still attached', async () => {
    settle('completed')
    expect(service.getSummaryById(sessionId)?.hasActiveHandle).toBe(true)

    await service.compactContext(sessionId)

    expect(fixture.manageContext).toHaveBeenCalledTimes(1)
    expect(service.getConversation(sessionId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          text: 'Provider context compacted manually.',
        }),
      ]),
    )
  })

  it('refuses while the turn is still running', async () => {
    fixture.emit({ kind: 'session.patch', patch: { status: 'running' } })

    await expect(service.compactContext(sessionId)).rejects.toThrow(
      'Context can only be compacted while the session is idle',
    )
    expect(fixture.manageContext).not.toHaveBeenCalled()
  })

  it('refuses while the turn is answered and not yet settled', async () => {
    fixture.emit({ kind: 'session.patch', patch: { status: 'answered' } })

    await expect(service.compactContext(sessionId)).rejects.toThrow(
      'Context can only be compacted while the session is idle',
    )
    expect(fixture.manageContext).not.toHaveBeenCalled()
  })

  it('disposes the idle resident process before it compacts (MAR-3243 R2)', async () => {
    settle('completed')

    await service.compactContext(sessionId)

    expect(fixture.calls).toEqual(['dispose', 'manageContext'])
    expect(fixture.dispose).toHaveBeenCalledTimes(1)
    expect(service.getSummaryById(sessionId)?.hasActiveHandle).toBe(false)
  })
})
