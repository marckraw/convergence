import { describe, expect, it, vi } from 'vitest'
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
    sendMessage: vi.fn(),
    compactContext: vi.fn(),
    getQueuedInputs: vi.fn(() => []),
    cancelQueuedInput: vi.fn(),
    approve: vi.fn(),
    deny: vi.fn(),
    stop: vi.fn(),
    rename: vi.fn(),
    regenerateName: vi.fn(),
    setPrimarySurface: vi.fn(() => sessionFixture),
    setModelSelection: vi.fn(() => sessionFixture),
    setSummaryUpdateListener: vi.fn(),
    setConversationPatchListener: vi.fn(),
    setQueuedInputPatchListener: vi.fn(),
    setTurnDeltaListener: vi.fn(),
    ...overrides,
  }
}

describe('SessionAppService', () => {
  it('applies session defaults before creating a session', async () => {
    const sessions = createSessionBackend()
    const app = new SessionAppService(sessions, {
      resolveSessionDefaults: vi.fn(async () => ({
        providerId: 'claude-code',
        modelId: 'sonnet',
        effortId: 'high' as const,
      })),
    })
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
    const app = new SessionAppService(sessions, {
      resolveSessionDefaults: vi.fn(async () => ({
        providerId: 'claude-code',
        modelId: 'sonnet',
        effortId: 'high' as const,
      })),
    })
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
    const app = new SessionAppService(sessions, {
      resolveSessionDefaults: vi.fn(async () => null),
    })
    const input = {
      text: 'continue',
      attachmentIds: ['attachment-1'],
      deliveryMode: 'follow-up' as const,
    }

    await app.sendSessionMessage('session-1', input)
    app.approveAttentionRequest('session-1', 'approval-1')
    app.stopSession('session-1')

    expect(sessions.sendMessage).toHaveBeenCalledWith('session-1', input)
    expect(sessions.approve).toHaveBeenCalledWith('session-1', 'approval-1')
    expect(sessions.stop).toHaveBeenCalledWith('session-1')
  })

  it('passes a model selection straight through, refusals included (MAR-2550)', () => {
    const sessions = createSessionBackend({
      setModelSelection: vi.fn(() => {
        throw new Error(
          'Model and effort can only change while the session is idle.',
        )
      }),
    })
    const app = new SessionAppService(sessions, {
      resolveSessionDefaults: vi.fn(async () => null),
    })

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
