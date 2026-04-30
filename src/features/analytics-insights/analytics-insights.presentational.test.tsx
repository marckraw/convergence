import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AnalyticsOverview } from '@/entities/analytics'
import { AnalyticsInsights } from './analytics-insights.presentational'

vi.mock('@/shared/ui/chartgpu-chart.container', () => ({
  ChartGpuChart: vi.fn(({ fallbackTitle }: { fallbackTitle?: string }) => (
    <div data-testid="chartgpu-chart">{fallbackTitle ?? 'chart'}</div>
  )),
}))

const overview: AnalyticsOverview = {
  range: {
    preset: '30d',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
  },
  totals: {
    userMessages: 12,
    assistantMessages: 18,
    userWords: 940,
    assistantWords: 4_200,
    sessionsCreated: 4,
    turnsCompleted: 16,
    filesChanged: 8,
    linesAdded: 320,
    linesDeleted: 41,
    approvalRequests: 3,
    inputRequests: 2,
    attachmentsSent: 5,
    toolCalls: 27,
    failedSessions: 0,
  },
  streaks: {
    current: 3,
    longest: 8,
    activeDays: ['2026-04-28', '2026-04-29', '2026-04-30'],
  },
  dailyActivity: [
    {
      date: '2026-04-28',
      userMessages: 4,
      assistantMessages: 5,
      userWords: 120,
      assistantWords: 900,
      sessionsCreated: 1,
      turnsCompleted: 4,
      filesChanged: 1,
    },
    {
      date: '2026-04-29',
      userMessages: 3,
      assistantMessages: 6,
      userWords: 200,
      assistantWords: 1_100,
      sessionsCreated: 1,
      turnsCompleted: 5,
      filesChanged: 3,
    },
    {
      date: '2026-04-30',
      userMessages: 5,
      assistantMessages: 7,
      userWords: 620,
      assistantWords: 2_200,
      sessionsCreated: 2,
      turnsCompleted: 7,
      filesChanged: 4,
    },
  ],
  providerUsage: [
    {
      providerId: 'codex',
      providerName: 'Codex',
      sessionsCreated: 3,
      turnsCompleted: 12,
      userMessages: 9,
      assistantMessages: 13,
    },
  ],
  projectUsage: [
    {
      projectId: 'project-1',
      projectName: 'Convergence',
      sessionsCreated: 4,
      turnsCompleted: 16,
      userMessages: 12,
      assistantMessages: 18,
    },
  ],
  weekdayHourActivity: [{ weekday: 4, hour: 14, count: 6 }],
  conversationBalance: [
    { date: '2026-04-28', userWords: 120, assistantWords: 900 },
    { date: '2026-04-29', userWords: 200, assistantWords: 1_100 },
    { date: '2026-04-30', userWords: 620, assistantWords: 2_200 },
  ],
  deterministicProfile: {
    mostUsedProvider: null,
    mostActiveProject: null,
    peakActivity: null,
    sessionSizeBucket: 'normal-task',
    interactionShape: 'mixed-exploration-implementation',
    summary: 'Local usage summary.',
  },
  generatedProfile: null,
}

const providers = [
  {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    kind: 'conversation' as const,
    supportsContinuation: true,
    defaultModelId: 'gpt-5.4',
    modelOptions: [
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        defaultEffort: 'medium' as const,
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
  },
]

function renderInsights(
  props: Partial<Parameters<typeof AnalyticsInsights>[0]> = {},
) {
  return render(
    <AnalyticsInsights
      overview={overview}
      rangePreset="30d"
      activeTab="usage"
      isLoading={false}
      isGeneratingProfile={false}
      error={null}
      providers={providers}
      profileProviderId="codex"
      profileModelId="gpt-5.4"
      generateDialogOpen={false}
      onRangeChange={vi.fn()}
      onTabChange={vi.fn()}
      onRetry={vi.fn()}
      onGenerateDialogOpenChange={vi.fn()}
      onProfileProviderChange={vi.fn()}
      onProfileModelChange={vi.fn()}
      onGenerateProfile={vi.fn()}
      onDeleteGeneratedProfile={vi.fn()}
      {...props}
    />,
  )
}

describe('AnalyticsInsights', () => {
  it('renders populated usage metrics and chart panels', () => {
    renderInsights()

    expect(screen.getAllByText('User messages').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Assistant messages').length).toBeGreaterThan(0)
    expect(screen.getByText('Convergence')).toBeInTheDocument()
    expect(screen.getByText('Streak calendar')).toBeInTheDocument()
    expect(screen.getAllByTestId('chartgpu-chart')).toHaveLength(3)
  })

  it('calls onRangeChange when a range button is selected', () => {
    const onRangeChange = vi.fn()

    renderInsights({ onRangeChange })

    fireEvent.click(screen.getByRole('button', { name: '7 days' }))

    expect(onRangeChange).toHaveBeenCalledWith('7d')
  })

  it('shows empty-state copy for an empty overview', () => {
    renderInsights({
      overview: {
        ...overview,
        totals: {
          ...overview.totals,
          userMessages: 0,
          assistantMessages: 0,
          sessionsCreated: 0,
          turnsCompleted: 0,
        },
        dailyActivity: [],
        providerUsage: [],
        projectUsage: [],
        weekdayHourActivity: [],
        conversationBalance: [],
        streaks: { current: 0, longest: 0, activeDays: [] },
      },
    })

    expect(screen.getByText('No usage in this range')).toBeInTheDocument()
    expect(screen.getByText('No project activity')).toBeInTheDocument()
    expect(screen.getByText('No hourly pattern')).toBeInTheDocument()
  })

  it('renders a compact loading state while usage analytics load', () => {
    renderInsights({ overview: null, isLoading: true })

    expect(screen.getByLabelText('Loading local analytics')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('switches to the work style tab', () => {
    const onTabChange = vi.fn()

    renderInsights({ activeTab: 'work-style', onTabChange })

    expect(screen.getByText('Deterministic local profile')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Your Usage' }))
    expect(onTabChange).toHaveBeenCalledWith('usage')
  })

  it('does not generate profile until the confirmation dialog is confirmed', () => {
    const onGenerateDialogOpenChange = vi.fn()
    const onGenerateProfile = vi.fn()

    renderInsights({
      activeTab: 'work-style',
      generateDialogOpen: true,
      onGenerateDialogOpenChange,
      onGenerateProfile,
    })

    expect(onGenerateProfile).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Generate' }).at(-1)!)

    expect(onGenerateProfile).toHaveBeenCalledTimes(1)
  })
})
