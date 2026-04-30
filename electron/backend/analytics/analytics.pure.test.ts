import { describe, expect, it } from 'vitest'
import {
  buildAnalyticsOverview,
  calculateStreaks,
  countWords,
  resolveAnalyticsRange,
  toLocalDate,
} from './analytics.pure'
import type {
  AnalyticsAttachmentInput,
  AnalyticsConversationItemInput,
  AnalyticsFileChangeInput,
  AnalyticsSessionInput,
  AnalyticsTurnInput,
  BuildAnalyticsOverviewInput,
} from './analytics.types'

const baseInput: BuildAnalyticsOverviewInput = {
  now: '2026-04-30T12:00:00.000Z',
  rangePreset: '30d',
  sessions: [],
  conversationItems: [],
  turns: [],
  fileChanges: [],
  attachments: [],
  generatedProfile: null,
}

function session(
  overrides: Partial<AnalyticsSessionInput> = {},
): AnalyticsSessionInput {
  return {
    id: 's1',
    projectId: 'p1',
    projectName: 'Convergence',
    providerId: 'codex',
    providerName: 'Codex',
    status: 'completed',
    primarySurface: 'conversation',
    archivedAt: null,
    createdAt: '2026-04-29T09:00:00.000Z',
    updatedAt: '2026-04-29T10:00:00.000Z',
    ...overrides,
  }
}

function message(
  overrides: Partial<AnalyticsConversationItemInput> = {},
): AnalyticsConversationItemInput {
  return {
    id: 'm1',
    sessionId: 's1',
    kind: 'message',
    actor: 'user',
    text: 'please inspect this code',
    createdAt: '2026-04-29T09:05:00.000Z',
    ...overrides,
  }
}

function turn(overrides: Partial<AnalyticsTurnInput> = {}): AnalyticsTurnInput {
  return {
    id: 't1',
    sessionId: 's1',
    status: 'completed',
    startedAt: '2026-04-29T09:06:00.000Z',
    endedAt: '2026-04-29T09:12:00.000Z',
    ...overrides,
  }
}

function fileChange(
  overrides: Partial<AnalyticsFileChangeInput> = {},
): AnalyticsFileChangeInput {
  return {
    id: 'fc1',
    sessionId: 's1',
    turnId: 't1',
    additions: 12,
    deletions: 3,
    createdAt: '2026-04-29T09:13:00.000Z',
    ...overrides,
  }
}

function attachment(
  overrides: Partial<AnalyticsAttachmentInput> = {},
): AnalyticsAttachmentInput {
  return {
    id: 'a1',
    sessionId: 's1',
    createdAt: '2026-04-29T09:04:00.000Z',
    ...overrides,
  }
}

describe('analytics pure helpers', () => {
  it('counts words with whitespace normalization', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
    expect(countWords('one two\nthree\tfour')).toBe(4)
  })

  it('resolves fixed ranges as inclusive windows ending today', () => {
    expect(resolveAnalyticsRange('7d', '2026-04-30T12:00:00.000Z')).toEqual({
      preset: '7d',
      startDate: '2026-04-24',
      endDate: '2026-04-30',
    })
    expect(resolveAnalyticsRange('30d', '2026-04-30T12:00:00.000Z')).toEqual({
      preset: '30d',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    })
    expect(resolveAnalyticsRange('90d', '2026-04-30T12:00:00.000Z')).toEqual({
      preset: '90d',
      startDate: '2026-01-31',
      endDate: '2026-04-30',
    })
  })

  it('resolves all-time range from the earliest activity date', () => {
    expect(
      resolveAnalyticsRange('all', '2026-04-30T12:00:00.000Z', [
        '2026-04-10',
        '2026-02-03',
        '2026-05-01',
      ]),
    ).toEqual({
      preset: 'all',
      startDate: '2026-02-03',
      endDate: '2026-04-30',
    })
  })

  it('calculates current and longest streaks with gap handling', () => {
    expect(
      calculateStreaks(
        [
          '2026-04-20',
          '2026-04-21',
          '2026-04-24',
          '2026-04-25',
          '2026-04-26',
          '2026-04-29',
        ],
        '2026-04-30',
      ),
    ).toEqual({
      current: 1,
      longest: 3,
      activeDays: [
        '2026-04-20',
        '2026-04-21',
        '2026-04-24',
        '2026-04-25',
        '2026-04-26',
        '2026-04-29',
      ],
    })
  })

  it('returns an empty overview for no local activity', () => {
    const overview = buildAnalyticsOverview(baseInput)

    expect(overview.range).toEqual({
      preset: '30d',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    })
    expect(overview.totals.sessionsCreated).toBe(0)
    expect(overview.totals.userWords).toBe(0)
    expect(overview.streaks).toEqual({
      current: 0,
      longest: 0,
      activeDays: [],
    })
    expect(overview.dailyActivity).toHaveLength(30)
    expect(overview.providerUsage).toEqual([])
    expect(overview.deterministicProfile).toMatchObject({
      mostUsedProvider: null,
      mostActiveProject: null,
      peakActivity: null,
      sessionSizeBucket: 'none',
      interactionShape: 'none',
    })
  })

  it('builds totals, daily activity, and conversation balance', () => {
    const overview = buildAnalyticsOverview({
      ...baseInput,
      sessions: [session()],
      conversationItems: [
        message({ text: 'please inspect this code' }),
        message({
          id: 'm2',
          actor: 'assistant',
          text: 'I found a focused path forward',
          createdAt: '2026-04-29T09:06:00.000Z',
        }),
        message({
          id: 'approval',
          kind: 'approval-request',
          actor: null,
          text: 'Allow command?',
        }),
        message({
          id: 'input',
          kind: 'input-request',
          actor: null,
          text: 'Need more input',
        }),
        message({
          id: 'tool',
          kind: 'tool-call',
          actor: null,
          text: 'rg analytics',
        }),
      ],
      turns: [turn()],
      fileChanges: [fileChange()],
      attachments: [attachment()],
    })

    expect(overview.totals).toEqual({
      userMessages: 1,
      assistantMessages: 1,
      userWords: 4,
      assistantWords: 6,
      sessionsCreated: 1,
      turnsCompleted: 1,
      filesChanged: 1,
      linesAdded: 12,
      linesDeleted: 3,
      approvalRequests: 1,
      inputRequests: 1,
      attachmentsSent: 1,
      toolCalls: 1,
      failedSessions: 0,
    })
    expect(
      overview.dailyActivity.find((point) => point.date === '2026-04-29'),
    ).toMatchObject({
      userMessages: 1,
      assistantMessages: 1,
      userWords: 4,
      assistantWords: 6,
      sessionsCreated: 1,
      turnsCompleted: 1,
      filesChanged: 1,
    })
    expect(
      overview.conversationBalance.find((point) => point.date === '2026-04-29'),
    ).toEqual({
      date: '2026-04-29',
      userWords: 4,
      assistantWords: 6,
    })
  })

  it('sorts provider and project usage by sessions then turns', () => {
    const overview = buildAnalyticsOverview({
      ...baseInput,
      sessions: [
        session({ id: 's1', providerId: 'codex', providerName: 'Codex' }),
        session({
          id: 's2',
          projectId: 'p2',
          projectName: 'Backpack',
          providerId: 'claude-code',
          providerName: 'Claude Code',
          createdAt: '2026-04-28T09:00:00.000Z',
        }),
        session({
          id: 's3',
          projectId: 'p2',
          projectName: 'Backpack',
          providerId: 'claude-code',
          providerName: 'Claude Code',
          createdAt: '2026-04-27T09:00:00.000Z',
        }),
      ],
      turns: [
        turn({ id: 't1', sessionId: 's1' }),
        turn({ id: 't2', sessionId: 's2' }),
        turn({ id: 't3', sessionId: 's3' }),
      ],
    })

    expect(overview.providerUsage.map((point) => point.providerId)).toEqual([
      'claude-code',
      'codex',
    ])
    expect(overview.projectUsage.map((point) => point.projectName)).toEqual([
      'Backpack',
      'Convergence',
    ])
  })

  it('builds weekday and hour heatmap buckets', () => {
    const overview = buildAnalyticsOverview({
      ...baseInput,
      sessions: [session({ createdAt: '2026-04-29T22:15:00' })],
      conversationItems: [
        message({ createdAt: '2026-04-29T22:20:00' }),
        message({
          id: 'm2',
          actor: 'assistant',
          createdAt: '2026-04-29T22:21:00',
        }),
      ],
      turns: [turn({ startedAt: '2026-04-29T22:22:00', endedAt: null })],
    })

    expect(overview.weekdayHourActivity).toContainEqual({
      weekday: 3,
      hour: 22,
      count: 4,
    })
    expect(overview.deterministicProfile.peakActivity).toEqual({
      weekday: 3,
      hour: 22,
      count: 4,
    })
  })

  it('classifies implementation-focused work style from local aggregates', () => {
    const overview = buildAnalyticsOverview({
      ...baseInput,
      sessions: [
        session({ id: 's1' }),
        session({ id: 's2', createdAt: '2026-04-28T09:00:00.000Z' }),
      ],
      conversationItems: [
        message({ sessionId: 's1' }),
        message({ id: 'm2', sessionId: 's2', text: 'fix the failing tests' }),
      ],
      turns: [turn({ sessionId: 's1' }), turn({ id: 't2', sessionId: 's2' })],
      fileChanges: [
        fileChange({ sessionId: 's1' }),
        fileChange({ id: 'fc2', sessionId: 's2', turnId: 't2' }),
      ],
    })

    expect(overview.deterministicProfile).toMatchObject({
      sessionSizeBucket: 'quick-check',
      interactionShape: 'mostly-implementation',
    })
    expect(overview.deterministicProfile.summary).toContain(
      'implementation-focused',
    )
  })

  it('classifies debugging work style when failed sessions dominate', () => {
    const overview = buildAnalyticsOverview({
      ...baseInput,
      sessions: [
        session({ id: 's1', status: 'failed' }),
        session({
          id: 's2',
          status: 'failed',
          createdAt: '2026-04-28T09:00:00.000Z',
        }),
        session({
          id: 's3',
          status: 'completed',
          createdAt: '2026-04-27T09:00:00.000Z',
        }),
      ],
    })

    expect(overview.totals.failedSessions).toBe(2)
    expect(overview.deterministicProfile.interactionShape).toBe(
      'mostly-debugging',
    )
  })

  it('keeps all-time daily activity empty when there are no source dates', () => {
    const overview = buildAnalyticsOverview({
      ...baseInput,
      rangePreset: 'all',
    })

    expect(overview.range).toEqual({
      preset: 'all',
      startDate: null,
      endDate: '2026-04-30',
    })
    expect(overview.dailyActivity).toEqual([])
  })

  it('converts ISO timestamps to local dates', () => {
    expect(toLocalDate('2026-04-30T12:00:00.000Z')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })
})
