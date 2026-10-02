import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import type { AnalyticsOverview } from '@/entities/analytics'
import type { ProviderInfo } from '@/entities/session'
import { AnalyticsInsights } from './analytics-insights.presentational'

const days = ['2026-09-25', '2026-09-26', '2026-09-28', '2026-09-30']

const overview: AnalyticsOverview = {
  range: { preset: '7d', startDate: '2026-09-24', endDate: '2026-09-30' },
  totals: {
    userMessages: 86,
    assistantMessages: 141,
    userWords: 9_240,
    assistantWords: 61_800,
    sessionsCreated: 14,
    turnsCompleted: 112,
    filesChanged: 64,
    linesAdded: 3_120,
    linesDeleted: 870,
    approvalRequests: 9,
    inputRequests: 4,
    attachmentsSent: 11,
    toolCalls: 1_204,
    failedSessions: 1,
  },
  streaks: { current: 3, longest: 11, activeDays: days },
  dailyActivity: days.map((date, index) => ({
    date,
    userMessages: 12 + index * 6,
    assistantMessages: 20 + index * 9,
    userWords: 1_400 + index * 300,
    assistantWords: 9_000 + index * 2_100,
    sessionsCreated: 2 + index,
    turnsCompleted: 18 + index * 7,
    filesChanged: 8 + index * 4,
  })),
  providerUsage: [
    {
      providerId: 'claude-code',
      providerName: 'Claude Code',
      sessionsCreated: 9,
      turnsCompleted: 74,
      userMessages: 55,
      assistantMessages: 92,
    },
    {
      providerId: 'codex',
      providerName: 'Codex',
      sessionsCreated: 5,
      turnsCompleted: 38,
      userMessages: 31,
      assistantMessages: 49,
    },
  ],
  modelUsage: [
    {
      modelId: 'claude-opus-5-5',
      modelLabel: 'Claude Opus 5.5',
      sessionsCreated: 9,
      turnsCompleted: 74,
      userMessages: 55,
      assistantMessages: 92,
      providerId: 'claude-code',
      providerName: 'Claude Code',
    },
  ],
  projectUsage: [
    {
      projectId: 'project-convergence',
      projectName: 'convergence',
      sessionsCreated: 11,
      turnsCompleted: 96,
      userMessages: 70,
      assistantMessages: 118,
    },
    {
      projectId: 'project-codewalk',
      projectName: 'codewalk',
      sessionsCreated: 3,
      turnsCompleted: 16,
      userMessages: 16,
      assistantMessages: 23,
    },
  ],
  weekdayHourActivity: [
    { weekday: 1, hour: 9, count: 12 },
    { weekday: 3, hour: 14, count: 21 },
    { weekday: 4, hour: 21, count: 7 },
  ],
  conversationBalance: days.map((date, index) => ({
    date,
    userWords: 1_400 + index * 300,
    assistantWords: 9_000 + index * 2_100,
  })),
  deterministicProfile: {
    mostUsedProvider: {
      providerId: 'claude-code',
      providerName: 'Claude Code',
      sessionsCreated: 9,
      turnsCompleted: 74,
      userMessages: 55,
      assistantMessages: 92,
    },
    mostActiveProject: {
      projectId: 'project-convergence',
      projectName: 'convergence',
      sessionsCreated: 11,
      turnsCompleted: 96,
      userMessages: 70,
      assistantMessages: 118,
    },
    peakActivity: { weekday: 3, hour: 14, count: 21 },
    sessionSizeBucket: 'long-running',
    interactionShape: 'mixed-exploration-implementation',
    summary:
      'Long sessions in one main project, mostly exploring and then building, with Claude Code doing most of the turns.',
  },
  generatedProfile: null,
}

const providers: ProviderInfo[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    kind: 'conversation',
    supportsContinuation: true,
    supportsConversationReset: true,
    defaultModelId: 'claude-opus-5-5',
    modelOptions: [
      {
        id: 'claude-opus-5-5',
        label: 'Claude Opus 5.5',
        defaultEffort: null,
        effortOptions: [],
      },
    ],
    attachments: {
      supportsImage: true,
      supportsPdf: true,
      supportsText: true,
      maxImageBytes: 5_000_000,
      maxPdfBytes: 10_000_000,
      maxTextBytes: 1_000_000,
      maxTotalBytes: 20_000_000,
    },
    midRunInput: {
      supportsAnswer: true,
      supportsNativeFollowUp: true,
      supportsAppQueuedFollowUp: true,
      supportsSteer: true,
      supportsInterrupt: true,
      defaultRunningMode: 'steer',
    },
  },
]

const meta = {
  title: 'Features/AnalyticsInsights/AnalyticsInsights',
  component: AnalyticsInsights,
  args: {
    overview,
    rangePreset: '7d',
    activeTab: 'usage',
    isLoading: false,
    isGeneratingProfile: false,
    error: null,
    providers,
    profileProviderId: 'claude-code',
    profileModelId: 'claude-opus-5-5',
    generateDialogOpen: false,
    onRangeChange: fn(),
    onTabChange: fn(),
    onRetry: fn(),
    onGenerateDialogOpenChange: fn(),
    onProfileProviderChange: fn(),
    onProfileModelChange: fn(),
    onGenerateProfile: fn(),
    onDeleteGeneratedProfile: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-240">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AnalyticsInsights>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Your usage: the totals, then each chart panel. A chart draws with WebGPU
 * where the browser has it, or says it cannot; either way the panels and
 * their legends stand. The views are tabs with their panels (DLG-14); the
 * range is a SegmentedControl, a radio group (R9).
 */
export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const tabs = canvas.getByRole('tablist', { name: 'Insights view' })
    const usage = within(tabs).getByRole('tab', { name: 'Your usage' })
    await expect(usage).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByRole('tabpanel')).toHaveAccessibleName(
      'Your usage',
    )
    await expect(
      canvas.getByRole('heading', { name: 'Daily activity' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('heading', { name: 'Conversation balance' }),
    ).toBeVisible()
    const range = canvas.getByRole('radiogroup', { name: 'Analytics range' })
    await expect(
      within(range).getByRole('radio', { name: '7 days' }),
    ).toBeChecked()
    await userEvent.click(within(range).getByRole('radio', { name: '90 days' }))
    await expect(args.onRangeChange).toHaveBeenCalledWith('90d')
    await userEvent.click(
      within(tabs).getByRole('tab', { name: 'Your work style' }),
    )
    await expect(args.onTabChange).toHaveBeenCalledWith('work-style')
  },
}

/** Your work style: the local profile, its facts, and Generate. */
export const WorkStyle: Story = {
  name: 'Work style',
  args: { activeTab: 'work-style' },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Based on the last 7 days' }),
    ).toBeVisible()
    await expect(
      canvas.getByText(/Long sessions in one main project/),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Generate…' }))
    await expect(args.onGenerateDialogOpenChange).toHaveBeenCalledWith(true)
  },
}

/** A generated profile: its themes replace the prompt, with Delete beside Regenerate. */
export const GeneratedProfile: Story = {
  name: 'Generated profile',
  args: {
    activeTab: 'work-style',
    overview: {
      ...overview,
      generatedProfile: {
        id: 'profile-1',
        rangePreset: '7d',
        rangeStartDate: '2026-09-24',
        rangeEndDate: '2026-09-30',
        providerId: 'claude-code',
        model: 'claude-opus-5-5',
        createdAt: '2026-09-30T18:00:00.000Z',
        payload: {
          version: 1,
          title: 'The long-run builder',
          summary:
            'You start with a question, let the agent explore, then stay with one change until it ships.',
          themes: [
            {
              label: 'Depth over breadth',
              description: 'Most sessions run past an hour on one project.',
            },
          ],
          caveats: ['Seven days is a short window.'],
        },
      },
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole('heading', { name: 'The long-run builder' }),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Delete…' }))
    await expect(args.onDeleteGeneratedProfile).toHaveBeenCalledOnce()
    await expect(
      canvas.getByRole('button', { name: 'Regenerate…' }),
    ).toBeEnabled()
  },
}

/** The Generate dialog, opened from the work style tab. */
export const GenerateDialog: Story = {
  name: 'Generate dialog',
  args: { activeTab: 'work-style', generateDialogOpen: true },
  play: async ({ args, userEvent }) => {
    const dialog = await screen.findByRole('dialog', {
      name: 'Generate work profile',
    })
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    )
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Generate' }),
    )
    await expect(args.onGenerateProfile).toHaveBeenCalledOnce()
  },
}

/** Busy: the first read is a status with its skeleton, and the range waits. */
export const Busy: Story = {
  args: { overview: null, isLoading: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('status', { name: 'Loading local analytics' }),
    ).toHaveAttribute('aria-busy', 'true')
    await expect(
      canvas.getByRole('radio', { name: '30 days' }),
    ).toHaveAttribute('aria-disabled', 'true')
  },
}

/** Failed: the error is an alert with Retry. */
export const Failed: Story = {
  args: {
    overview: null,
    error: 'Could not read local analytics: the database is locked.',
  },
  play: async ({ args, canvas, userEvent }) => {
    const alert = canvas.getByRole('alert')
    await expect(alert).toHaveTextContent('the database is locked')
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    await expect(args.onRetry).toHaveBeenCalledOnce()
  },
}

/** Empty: no local history yet. */
export const Empty: Story = {
  args: { overview: null },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No analytics yet')).toBeVisible()
  },
}

/** Empty work style: nothing to describe, and no provider to generate with. */
export const EmptyWorkStyle: Story = {
  name: 'Empty, work style',
  args: { activeTab: 'work-style', overview: null, providers: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No work style yet')).toBeVisible()
  },
}

export const Dark: Story = {
  ...Default,
  globals: { theme: 'dark' },
}
