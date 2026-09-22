import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { CrewService } from '../crew/crew.service'
import { RelayService } from '../relay/relay.service'
import {
  SessionAppService,
  type SessionAppBackend,
} from './session-app.service'
import type { CreateSessionInput, Session } from '../session/session.types'

const sessionFixture: Session = {
  id: 'session-1',
  contextKind: 'project',
  projectId: 'project-1',
  workspaceId: null,
  providerId: 'codex',
  model: 'gpt-5',
  effort: 'medium',
  name: 'Task',
  status: 'idle',
  attention: 'none',
  activity: null,
  contextWindow: null,
  workingDirectory: '/repo',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  executionHost: 'local',
  workAddress: null,
  reportedWorkspace: null,
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-05-28T00:00:00.000Z',
  updatedAt: '2026-05-28T00:00:00.000Z',
}

function createSessionBackend(
  overrides: Partial<SessionAppBackend> = {},
): SessionAppBackend {
  return {
    create: vi.fn(() => sessionFixture),
    getSummariesByProjectId: vi.fn(() => []),
    getAllSummaries: vi.fn(() => []),
    getGlobalSummaries: vi.fn(() => []),
    getSummaryById: vi.fn(() => null),
    getConversation: vi.fn(() => []),
    archive: vi.fn(),
    unarchive: vi.fn(),
    delete: vi.fn(),
    start: vi.fn(),
    sendPersonMessage: vi.fn(async () => ({ dispatchId: 'd', queued: false })),
    compactContext: vi.fn(),
    getQueuedInputs: vi.fn(() => []),
    cancelQueuedInput: vi.fn(),
    redeliverQueuedInput: vi.fn(),
    approve: vi.fn(),
    deny: vi.fn(),
    stop: vi.fn(),
    rename: vi.fn(),
    regenerateName: vi.fn(),
    setPrimarySurface: vi.fn(() => sessionFixture),
    setModelSelection: vi.fn(async () => sessionFixture),
    setEvidenceUpdateListener: vi.fn(),
    setSummaryUpdateListener: vi.fn(),
    setConversationPatchListener: vi.fn(),
    setQueuedInputPatchListener: vi.fn(),
    setTurnDeltaListener: vi.fn(),
    ...overrides,
  }
}

describe('SessionAppService', () => {
  const relays = { removeForSession: vi.fn(() => 0) }
  const crews = { removeMembershipsForSession: vi.fn(() => 0) }

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('MAR-3254 R1 deletion removes both directions and the seat, preserving other wires and history', () => {
    const db = getDatabase()
    db.prepare(
      "INSERT INTO projects (id, name, repository_path) VALUES ('p1', 'p1', '/tmp/p1')",
    ).run()
    for (const id of ['s1', 's2', 's3']) {
      db.prepare(
        `INSERT INTO sessions (id, project_id, provider_id, name, working_directory)
        VALUES (?, 'p1', 'codex', ?, '/tmp/p1')`,
      ).run(id, id)
    }
    const realCrews = new CrewService(db)
    const realRelays = new RelayService(db)
    const crew = realCrews.create({ name: 'Review', sessionIds: ['s1', 's2'] })
    const wires = [
      ['s1', 's2'],
      ['s2', 's1'],
      ['s2', 's3'],
      ['s3', 's2'],
    ].map(([sourceSessionId, targetSessionId]) =>
      realRelays.create({
        crewId: crew.id,
        sourceSessionId,
        targetSessionId,
        action: 'hail',
      }),
    )
    const hop = realRelays.appendHop({
      relayId: wires[0].id,
      crewId: crew.id,
      flowRunId: 'history',
      sourceSessionId: 's1',
      targetSessionId: 's2',
      triggerStatus: 'completed',
      outcome: 'delivered',
    })
    const sessions = createSessionBackend({
      delete: (id) => {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
      },
    })
    const app = new SessionAppService(
      sessions,
      { resolveSessionDefaults: async () => null },
      realRelays,
      realCrews,
    )

    expect(app.deleteSession('s1')).toEqual({
      relaysRemoved: 2,
      membershipsRemoved: 1,
    })
    expect(
      db.prepare('SELECT id FROM sessions WHERE id = ?').get('s1'),
    ).toBeUndefined()
    expect(realRelays.list()).toEqual(wires.slice(2))
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM session_relays').get(),
    ).toEqual({ count: 2 })
    expect(
      db.prepare('SELECT session_id FROM session_crew_members').all(),
    ).toEqual([{ session_id: 's2' }])
    expect(realCrews.getById(crew.id)?.sessionIds).toEqual(['s2'])
    expect(realRelays.listHops(crew.id)).toEqual([hop])
  })

  it('MAR-3254 R1 leaves wires and memberships alone when session deletion fails', () => {
    const wireCleanup = { removeForSession: vi.fn() }
    const seatCleanup = { removeMembershipsForSession: vi.fn() }
    const app = new SessionAppService(
      createSessionBackend({
        delete: () => {
          throw new Error('delete failed')
        },
      }),
      { resolveSessionDefaults: async () => null },
      wireCleanup,
      seatCleanup,
    )
    expect(() => app.deleteSession('s1')).toThrow('delete failed')
    expect(wireCleanup.removeForSession).not.toHaveBeenCalled()
    expect(seatCleanup.removeMembershipsForSession).not.toHaveBeenCalled()
  })

  it('applies session defaults before creating a session', async () => {
    const sessions = createSessionBackend()
    const app = new SessionAppService(
      sessions,
      {
        resolveSessionDefaults: vi.fn(async () => ({
          providerId: 'claude-code',
          modelId: 'sonnet',
          effortId: 'high' as const,
        })),
      },
      relays,
      crews,
    )
    const input: CreateSessionInput = {
      contextKind: 'project',
      projectId: 'project-1',
      workspaceId: null,
      providerId: '',
      model: null,
      effort: null,
      name: 'Task',
    }

    await app.createSession(input)

    expect(sessions.create).toHaveBeenCalledWith({
      ...input,
      providerId: 'claude-code',
      model: 'sonnet',
      effort: 'high',
    })
  })

  it('keeps explicit session settings over defaults', async () => {
    const sessions = createSessionBackend()
    const app = new SessionAppService(
      sessions,
      {
        resolveSessionDefaults: vi.fn(async () => ({
          providerId: 'claude-code',
          modelId: 'sonnet',
          effortId: 'high' as const,
        })),
      },
      relays,
      crews,
    )
    const input: CreateSessionInput = {
      contextKind: 'project',
      projectId: 'project-1',
      workspaceId: null,
      providerId: 'codex',
      model: 'gpt-5',
      effort: 'medium',
      name: 'Task',
    }

    await app.createSession(input)

    expect(sessions.create).toHaveBeenCalledWith(input)
  })

  it('delegates session command methods through the app boundary', async () => {
    const sessions = createSessionBackend()
    const app = new SessionAppService(
      sessions,
      {
        resolveSessionDefaults: vi.fn(async () => null),
      },
      relays,
      crews,
    )
    const input = {
      text: 'continue',
      attachmentIds: ['attachment-1'],
      deliveryMode: 'follow-up' as const,
    }

    await app.sendSessionMessage('session-1', input)
    app.approveAttentionRequest('session-1', 'approval-1')
    app.stopSession('session-1')

    expect(sessions.sendPersonMessage).toHaveBeenCalledWith('session-1', input)
    expect(sessions.approve).toHaveBeenCalledWith('session-1', 'approval-1')
    expect(sessions.stop).toHaveBeenCalledWith('session-1')
  })

  it('R2 app forwards the chosen session scope — drop approval options turns red', () => {
    const sessions = createSessionBackend()
    const app = new SessionAppService(
      sessions,
      {
        resolveSessionDefaults: vi.fn(async () => null),
      },
      relays,
      crews,
    )
    app.approveAttentionRequest('session', 'tool', { scope: 'session' })
    expect(vi.mocked(sessions.approve).mock.calls).toEqual([
      ['session', 'tool', { scope: 'session' }],
    ])
  })

  it('passes a model selection straight through, refusals included (MAR-2550)', () => {
    const sessions = createSessionBackend({
      setModelSelection: vi.fn(() => {
        throw new Error(
          'Model and effort can only change while the session is idle.',
        )
      }),
    })
    const app = new SessionAppService(
      sessions,
      {
        resolveSessionDefaults: vi.fn(async () => null),
      },
      relays,
      crews,
    )

    expect(() =>
      app.setSessionModelSelection('session-1', {
        providerId: 'claude-code',
        model: 'opus',
        effort: 'high',
      }),
    ).toThrow(/only change while the session is idle/)
    expect(sessions.setModelSelection).toHaveBeenCalledWith('session-1', {
      providerId: 'claude-code',
      model: 'opus',
      effort: 'high',
    })
  })
})
