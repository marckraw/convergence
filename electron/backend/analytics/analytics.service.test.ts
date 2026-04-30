import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import type { Provider } from '../provider/provider.types'
import { AnalyticsProfileService } from './analytics-profile.service'
import { AnalyticsService } from './analytics.service'

function insertProject(db: Database.Database, id: string, name: string): void {
  db.prepare(
    `
      INSERT INTO projects (id, name, repository_path, settings, created_at, updated_at)
      VALUES (?, ?, ?, '{}', ?, ?)
    `,
  ).run(
    id,
    name,
    `/tmp/${id}`,
    '2026-04-01T00:00:00.000Z',
    '2026-04-01T00:00:00.000Z',
  )
}

function insertSession(
  db: Database.Database,
  input: {
    id: string
    projectId: string
    providerId: string
    status?: string
    createdAt: string
    updatedAt?: string
  },
): void {
  db.prepare(
    `
      INSERT INTO sessions (
        id,
        project_id,
        provider_id,
        name,
        status,
        attention,
        working_directory,
        primary_surface,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'none', ?, 'conversation', ?, ?)
    `,
  ).run(
    input.id,
    input.projectId,
    input.providerId,
    input.id,
    input.status ?? 'completed',
    `/tmp/${input.projectId}`,
    input.createdAt,
    input.updatedAt ?? input.createdAt,
  )
}

function insertConversationItem(
  db: Database.Database,
  input: {
    id: string
    sessionId: string
    sequence: number
    kind: string
    payload: Record<string, unknown>
    createdAt: string
  },
): void {
  db.prepare(
    `
      INSERT INTO session_conversation_items (
        id,
        session_id,
        sequence,
        kind,
        state,
        payload_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'complete', ?, ?, ?)
    `,
  ).run(
    input.id,
    input.sessionId,
    input.sequence,
    input.kind,
    JSON.stringify(input.payload),
    input.createdAt,
    input.createdAt,
  )
}

function insertTurn(
  db: Database.Database,
  input: {
    id: string
    sessionId: string
    sequence: number
    status?: string
    startedAt: string
    endedAt: string | null
  },
): void {
  db.prepare(
    `
      INSERT INTO session_turns (
        id,
        session_id,
        sequence,
        started_at,
        ended_at,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    input.id,
    input.sessionId,
    input.sequence,
    input.startedAt,
    input.endedAt,
    input.status ?? 'completed',
  )
}

function insertFileChange(
  db: Database.Database,
  input: {
    id: string
    sessionId: string
    turnId: string
    additions: number
    deletions: number
    createdAt: string
  },
): void {
  db.prepare(
    `
      INSERT INTO session_turn_file_changes (
        id,
        session_id,
        turn_id,
        file_path,
        status,
        additions,
        deletions,
        diff,
        created_at
      )
      VALUES (?, ?, ?, 'src/app.ts', 'modified', ?, ?, '', ?)
    `,
  ).run(
    input.id,
    input.sessionId,
    input.turnId,
    input.additions,
    input.deletions,
    input.createdAt,
  )
}

function insertAttachment(
  db: Database.Database,
  input: { id: string; sessionId: string; createdAt: string },
): void {
  db.prepare(
    `
      INSERT INTO attachments (
        id,
        session_id,
        kind,
        mime_type,
        filename,
        size_bytes,
        storage_path,
        created_at
      )
      VALUES (?, ?, 'text', 'text/plain', 'note.txt', 12, '/tmp/note.txt', ?)
    `,
  ).run(input.id, input.sessionId, input.createdAt)
}

describe('AnalyticsService', () => {
  let db: Database.Database
  let service: AnalyticsService

  beforeEach(() => {
    db = getDatabase()
    service = new AnalyticsService(db)
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('returns an empty overview from an empty database', () => {
    const overview = service.getOverview('30d', '2026-04-30T12:00:00.000Z')

    expect(overview.totals.sessionsCreated).toBe(0)
    expect(overview.totals.userMessages).toBe(0)
    expect(overview.dailyActivity).toHaveLength(30)
    expect(overview.generatedProfile).toBeNull()
  })

  it('computes overview data from existing local tables', () => {
    insertProject(db, 'p1', 'Convergence')
    insertProject(db, 'p2', 'Backpack')
    insertSession(db, {
      id: 's1',
      projectId: 'p1',
      providerId: 'codex',
      createdAt: '2026-04-29T09:00:00.000Z',
    })
    insertSession(db, {
      id: 's2',
      projectId: 'p2',
      providerId: 'claude-code',
      status: 'failed',
      createdAt: '2026-04-28T09:00:00.000Z',
    })
    insertConversationItem(db, {
      id: 'm1',
      sessionId: 's1',
      sequence: 1,
      kind: 'message',
      payload: { actor: 'user', text: 'please inspect this code' },
      createdAt: '2026-04-29T09:05:00.000Z',
    })
    insertConversationItem(db, {
      id: 'm2',
      sessionId: 's1',
      sequence: 2,
      kind: 'message',
      payload: { actor: 'assistant', text: 'I found a path forward' },
      createdAt: '2026-04-29T09:06:00.000Z',
    })
    insertConversationItem(db, {
      id: 'approval',
      sessionId: 's1',
      sequence: 3,
      kind: 'approval-request',
      payload: { description: 'Allow command?' },
      createdAt: '2026-04-29T09:07:00.000Z',
    })
    insertTurn(db, {
      id: 't1',
      sessionId: 's1',
      sequence: 1,
      startedAt: '2026-04-29T09:07:00.000Z',
      endedAt: '2026-04-29T09:12:00.000Z',
    })
    insertFileChange(db, {
      id: 'fc1',
      sessionId: 's1',
      turnId: 't1',
      additions: 14,
      deletions: 4,
      createdAt: '2026-04-29T09:13:00.000Z',
    })
    insertAttachment(db, {
      id: 'a1',
      sessionId: 's1',
      createdAt: '2026-04-29T09:04:00.000Z',
    })

    const overview = service.getOverview('30d', '2026-04-30T12:00:00.000Z')

    expect(overview.totals).toMatchObject({
      userMessages: 1,
      assistantMessages: 1,
      userWords: 4,
      assistantWords: 5,
      sessionsCreated: 2,
      turnsCompleted: 1,
      filesChanged: 1,
      linesAdded: 14,
      linesDeleted: 4,
      approvalRequests: 1,
      attachmentsSent: 1,
      failedSessions: 1,
    })
    expect(overview.providerUsage.map((point) => point.providerName)).toEqual([
      'Codex',
      'Claude Code',
    ])
    expect(overview.projectUsage.map((point) => point.projectName)).toEqual([
      'Convergence',
      'Backpack',
    ])
    expect(
      overview.dailyActivity.find((point) => point.date === '2026-04-29'),
    ).toMatchObject({
      userMessages: 1,
      assistantMessages: 1,
      sessionsCreated: 1,
      turnsCompleted: 1,
      filesChanged: 1,
    })
    expect(overview.deterministicProfile.mostUsedProvider?.providerName).toBe(
      'Codex',
    )
  })

  it('filters fixed ranges and supports all-time ranges', () => {
    insertProject(db, 'p1', 'Convergence')
    insertSession(db, {
      id: 'old',
      projectId: 'p1',
      providerId: 'codex',
      createdAt: '2026-01-15T09:00:00.000Z',
    })
    insertSession(db, {
      id: 'recent',
      projectId: 'p1',
      providerId: 'codex',
      createdAt: '2026-04-29T09:00:00.000Z',
    })

    const recent = service.getOverview('7d', '2026-04-30T12:00:00.000Z')
    const all = service.getOverview('all', '2026-04-30T12:00:00.000Z')

    expect(recent.totals.sessionsCreated).toBe(1)
    expect(recent.range.startDate).toBe('2026-04-24')
    expect(all.totals.sessionsCreated).toBe(2)
    expect(all.range.startDate).toBe('2026-01-15')
  })

  it('rejects invalid range presets', () => {
    expect(() =>
      service.getOverview('forever', '2026-04-30T12:00:00.000Z'),
    ).toThrow('Invalid analytics range preset: forever')
  })

  it('includes the latest generated profile snapshot for the selected range', () => {
    const profiles = new AnalyticsProfileService(db)
    const snapshot = profiles.createProfileSnapshot({
      rangePreset: '30d',
      rangeStartDate: '2026-04-01',
      rangeEndDate: '2026-04-30',
      providerId: 'codex',
      model: 'gpt-5.4',
      payload: {
        version: 1,
        title: 'Contextual Builder',
        summary: 'You tend to explore before implementing.',
        themes: [],
        caveats: ['Based on local aggregate usage only.'],
      },
      createdAt: '2026-04-30T12:00:00.000Z',
    })

    const overview = service.getOverview('30d', '2026-04-30T12:00:00.000Z')

    expect(overview.generatedProfile).toMatchObject({
      id: snapshot.id,
      rangePreset: '30d',
      payload: { title: 'Contextual Builder' },
    })
  })

  it('generates a work profile from aggregate overview data and stores it', async () => {
    insertProject(db, 'p1', 'Convergence')
    insertSession(db, {
      id: 's1',
      projectId: 'p1',
      providerId: 'codex',
      createdAt: '2026-04-29T09:00:00.000Z',
    })
    insertConversationItem(db, {
      id: 'm1',
      sessionId: 's1',
      sequence: 1,
      kind: 'message',
      payload: { actor: 'user', text: 'please inspect this code' },
      createdAt: '2026-04-29T09:05:00.000Z',
    })

    const oneShot = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        version: 1,
        title: 'Contextual Builder',
        summary: 'You tend to explore before implementing.',
        themes: [{ label: 'Planning', description: 'Frequent setup.' }],
        caveats: ['Based on local aggregate usage only.'],
      }),
    })
    const providers = new ProviderRegistry()
    providers.register({
      id: 'codex',
      name: 'Codex',
      supportsContinuation: true,
      describe: async () => ({
        id: 'codex',
        name: 'Codex',
        vendorLabel: 'OpenAI',
        kind: 'conversation',
        supportsContinuation: true,
        defaultModelId: 'gpt-5.4',
        modelOptions: [
          {
            id: 'gpt-5.4',
            label: 'GPT-5.4',
            defaultEffort: 'medium',
            effortOptions: [],
          },
        ],
        attachments: {
          supportsImage: false,
          supportsPdf: false,
          supportsText: true,
          maxImageBytes: 0,
          maxPdfBytes: 0,
          maxTextBytes: 1,
          maxTotalBytes: 1,
        },
        midRunInput: {
          supportsAnswer: false,
          supportsNativeFollowUp: false,
          supportsAppQueuedFollowUp: false,
          supportsSteer: false,
          supportsInterrupt: false,
          defaultRunningMode: null,
        },
      }),
      start: () => {
        throw new Error('not used')
      },
      oneShot,
    } satisfies Provider)
    const serviceWithGeneration = new AnalyticsService(db, {
      providers,
      appSettings: {
        resolveExtractionModel: vi.fn().mockResolvedValue('gpt-5.4'),
      } as never,
      workingDirectory: '/tmp',
    })

    const snapshot = await serviceWithGeneration.generateWorkProfile(
      {
        rangePreset: '30d',
        providerId: 'codex',
        model: null,
      },
      '2026-04-30T12:00:00.000Z',
    )

    expect(oneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gpt-5.4',
        workingDirectory: '/tmp',
        prompt: expect.stringContaining('aggregate local usage data only'),
      }),
    )
    expect(snapshot).toMatchObject({
      rangePreset: '30d',
      rangeStartDate: '2026-04-01',
      rangeEndDate: '2026-04-30',
      providerId: 'codex',
      model: 'gpt-5.4',
      payload: { title: 'Contextual Builder' },
    })
    expect(
      serviceWithGeneration.getOverview('30d', '2026-04-30T12:00:00.000Z')
        .generatedProfile?.id,
    ).toBe(snapshot.id)
  })

  it('rejects profile generation for unavailable providers and models', async () => {
    const providers = new ProviderRegistry()
    providers.register({
      id: 'codex',
      name: 'Codex',
      supportsContinuation: true,
      describe: async () => ({
        id: 'codex',
        name: 'Codex',
        vendorLabel: 'OpenAI',
        kind: 'conversation',
        supportsContinuation: true,
        defaultModelId: 'gpt-5.4',
        modelOptions: [],
        attachments: {
          supportsImage: false,
          supportsPdf: false,
          supportsText: true,
          maxImageBytes: 0,
          maxPdfBytes: 0,
          maxTextBytes: 1,
          maxTotalBytes: 1,
        },
        midRunInput: {
          supportsAnswer: false,
          supportsNativeFollowUp: false,
          supportsAppQueuedFollowUp: false,
          supportsSteer: false,
          supportsInterrupt: false,
          defaultRunningMode: null,
        },
      }),
      start: () => {
        throw new Error('not used')
      },
      oneShot: vi.fn(),
    } satisfies Provider)
    const serviceWithGeneration = new AnalyticsService(db, {
      providers,
      appSettings: {
        resolveExtractionModel: vi.fn().mockResolvedValue('gpt-5.4'),
      } as never,
    })

    await expect(
      serviceWithGeneration.generateWorkProfile({
        rangePreset: '30d',
        providerId: 'missing',
        model: null,
      }),
    ).rejects.toThrow('Unknown provider id: missing')

    await expect(
      serviceWithGeneration.generateWorkProfile({
        rangePreset: '30d',
        providerId: 'codex',
        model: 'ghost',
      }),
    ).rejects.toThrow('Unknown model id for provider codex: ghost')
  })
})
