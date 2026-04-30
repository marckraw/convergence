import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AnalyticsOverview } from '@/entities/analytics'
import { WorkStyleTab } from './work-style-tab.presentational'

const provider = {
  providerId: 'codex',
  providerName: 'Codex',
  sessionsCreated: 4,
  turnsCompleted: 18,
  userMessages: 22,
  assistantMessages: 28,
}

const project = {
  projectId: 'convergence',
  projectName: 'Convergence',
  sessionsCreated: 4,
  turnsCompleted: 18,
  userMessages: 22,
  assistantMessages: 28,
}

const overview: AnalyticsOverview = {
  range: {
    preset: '30d',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
  },
  totals: {
    userMessages: 22,
    assistantMessages: 28,
    userWords: 1_200,
    assistantWords: 4_800,
    sessionsCreated: 4,
    turnsCompleted: 18,
    filesChanged: 9,
    linesAdded: 400,
    linesDeleted: 90,
    approvalRequests: 2,
    inputRequests: 1,
    attachmentsSent: 0,
    toolCalls: 31,
    failedSessions: 0,
  },
  streaks: { current: 2, longest: 5, activeDays: ['2026-04-29'] },
  dailyActivity: [],
  providerUsage: [provider],
  projectUsage: [project],
  weekdayHourActivity: [{ weekday: 3, hour: 22, count: 7 }],
  conversationBalance: [],
  deterministicProfile: {
    mostUsedProvider: provider,
    mostActiveProject: project,
    peakActivity: { weekday: 3, hour: 22, count: 7 },
    sessionSizeBucket: 'normal-task',
    interactionShape: 'mixed-exploration-implementation',
    summary:
      'Based on local activity in this range, you tend toward mixed exploration and implementation with Codex in Convergence.',
  },
  generatedProfile: null,
}

describe('WorkStyleTab', () => {
  it('renders deterministic local profile facts for populated usage', () => {
    render(<WorkStyleTab overview={overview} isLoading={false} />)

    expect(screen.getByText('Deterministic local profile')).toBeInTheDocument()
    expect(screen.getByText('Wed at 10p')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
    expect(screen.getByText('Convergence')).toBeInTheDocument()
    expect(screen.getByText('Normal tasks')).toBeInTheDocument()
    expect(screen.getByText('Explore and build')).toBeInTheDocument()
    expect(
      screen.getByText('No model call. No transcripts sent.'),
    ).toBeInTheDocument()
  })

  it('renders an empty state when no local sessions exist', () => {
    render(
      <WorkStyleTab
        overview={{
          ...overview,
          totals: { ...overview.totals, sessionsCreated: 0 },
          deterministicProfile: {
            ...overview.deterministicProfile,
            mostUsedProvider: null,
            mostActiveProject: null,
            peakActivity: null,
            sessionSizeBucket: 'none',
            interactionShape: 'none',
          },
        }}
        isLoading={false}
      />,
    )

    expect(screen.getByText('No local pattern yet')).toBeInTheDocument()
  })
})
