import { describe, expect, it } from 'vitest'
import type { AnalyticsOverview } from './analytics.types'
import {
  buildWorkProfilePrompt,
  parseGeneratedWorkProfilePayload,
} from './analytics-profile.pure'

const overview: AnalyticsOverview = {
  range: { preset: '30d', startDate: '2026-04-01', endDate: '2026-04-30' },
  totals: {
    userMessages: 4,
    assistantMessages: 8,
    userWords: 200,
    assistantWords: 900,
    sessionsCreated: 3,
    turnsCompleted: 7,
    filesChanged: 5,
    linesAdded: 100,
    linesDeleted: 20,
    approvalRequests: 2,
    inputRequests: 1,
    attachmentsSent: 0,
    toolCalls: 6,
    failedSessions: 0,
  },
  streaks: { current: 2, longest: 4, activeDays: ['2026-04-29'] },
  dailyActivity: [],
  providerUsage: [
    {
      providerId: 'codex',
      providerName: 'Codex',
      sessionsCreated: 3,
      turnsCompleted: 7,
      userMessages: 4,
      assistantMessages: 8,
    },
  ],
  projectUsage: [
    {
      projectId: 'p1',
      projectName: 'Convergence',
      sessionsCreated: 3,
      turnsCompleted: 7,
      userMessages: 4,
      assistantMessages: 8,
    },
  ],
  weekdayHourActivity: [],
  conversationBalance: [],
  deterministicProfile: {
    mostUsedProvider: null,
    mostActiveProject: null,
    peakActivity: { weekday: 3, hour: 22, count: 5 },
    sessionSizeBucket: 'normal-task',
    interactionShape: 'mixed-exploration-implementation',
    summary: 'Based on local activity.',
  },
  generatedProfile: null,
}

describe('analytics profile pure helpers', () => {
  it('builds a prompt from aggregate usage data only', () => {
    const prompt = buildWorkProfilePrompt(overview)

    expect(prompt).toContain('aggregate local usage data only')
    expect(prompt).toContain('Codex (7 turns)')
    expect(prompt).toContain('Convergence (7 turns)')
    expect(prompt).toContain(
      'Interaction shape: mixed-exploration-implementation',
    )
    expect(prompt).not.toContain('user said')
    expect(prompt).not.toContain('assistant said')
  })

  it('parses a valid generated JSON profile', () => {
    expect(
      parseGeneratedWorkProfilePayload(
        JSON.stringify({
          version: 1,
          title: 'Contextual Builder',
          summary: 'You tend to explore before implementing.',
          themes: [{ label: 'Planning', description: 'Frequent setup.' }],
          caveats: ['Based on local usage.'],
        }),
      ),
    ).toEqual({
      version: 1,
      title: 'Contextual Builder',
      summary: 'You tend to explore before implementing.',
      themes: [{ label: 'Planning', description: 'Frequent setup.' }],
      caveats: ['Based on local usage.'],
    })
  })

  it('parses fenced JSON and normalizes version to payload version one', () => {
    const payload = parseGeneratedWorkProfilePayload(
      '```json\n{"version":2,"title":"T","summary":"S","themes":[],"caveats":[]}\n```',
    )

    expect(payload.version).toBe(1)
    expect(payload.title).toBe('T')
  })

  it('rejects non-JSON responses', () => {
    expect(() => parseGeneratedWorkProfilePayload('not json')).toThrow(
      'Generated work profile was not valid JSON',
    )
  })
})
