import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/entities/session'
import {
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_ONBOARDING_PREFS,
  DEFAULT_UPDATE_PREFS,
  useAppSettingsStore,
} from '@/entities/app-settings'
import { useAnalyticsStore, type AnalyticsOverview } from '@/entities/analytics'
import { useDialogStore } from '@/entities/dialog'
import { Button } from '@/shared/ui/button'
import { AppSettingsDialogContainer } from './app-settings.container'

const TEST_ATTACHMENTS = {
  supportsImage: true,
  supportsPdf: true,
  supportsText: true,
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 20 * 1024 * 1024,
  maxTextBytes: 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
}

const TEST_MID_RUN_INPUT = {
  supportsAnswer: false,
  supportsNativeFollowUp: false,
  supportsAppQueuedFollowUp: false,
  supportsSteer: false,
  supportsInterrupt: false,
  defaultRunningMode: null,
}

const providers = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    kind: 'conversation' as const,
    supportsContinuation: true,
    defaultModelId: 'sonnet',
    modelOptions: [
      {
        id: 'sonnet',
        label: 'Claude Sonnet',
        defaultEffort: 'medium' as const,
        effortOptions: [
          { id: 'low' as const, label: 'Low' },
          { id: 'medium' as const, label: 'Medium' },
          { id: 'high' as const, label: 'High' },
        ],
      },
    ],
    attachments: TEST_ATTACHMENTS,
    midRunInput: TEST_MID_RUN_INPUT,
  },
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
        effortOptions: [
          { id: 'low' as const, label: 'Low' },
          { id: 'medium' as const, label: 'Medium' },
          { id: 'high' as const, label: 'High' },
        ],
      },
    ],
    attachments: TEST_ATTACHMENTS,
    midRunInput: TEST_MID_RUN_INPUT,
  },
]

const EMPTY_ANALYTICS_OVERVIEW: AnalyticsOverview = {
  range: {
    preset: '30d',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
  },
  totals: {
    userMessages: 0,
    assistantMessages: 0,
    userWords: 0,
    assistantWords: 0,
    sessionsCreated: 0,
    turnsCompleted: 0,
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0,
    approvalRequests: 0,
    inputRequests: 0,
    attachmentsSent: 0,
    toolCalls: 0,
    failedSessions: 0,
  },
  streaks: { current: 0, longest: 0, activeDays: [] },
  dailyActivity: [],
  providerUsage: [],
  projectUsage: [],
  weekdayHourActivity: [],
  conversationBalance: [],
  deterministicProfile: {
    mostUsedProvider: null,
    mostActiveProject: null,
    peakActivity: null,
    sessionSizeBucket: 'none',
    interactionShape: 'none',
    summary: 'No local usage yet.',
  },
  generatedProfile: null,
}

function primeStores(stored: {
  defaultProviderId: string | null
  defaultModelId: string | null
  defaultEffortId:
    | 'low'
    | 'medium'
    | 'high'
    | 'max'
    | 'minimal'
    | 'none'
    | 'xhigh'
    | null
}) {
  useSessionStore.setState({
    sessions: [],
    globalSessions: [],
    needsYouDismissals: {},
    currentProjectId: null,
    activeSessionId: null,
    draftWorkspaceId: null,
    providers,
    error: null,
  })
  useAppSettingsStore.setState({
    settings: {
      ...stored,
      namingModelByProvider: {},
      extractionModelByProvider: {},
      notifications: DEFAULT_NOTIFICATION_PREFS,
      onboarding: DEFAULT_ONBOARDING_PREFS,
      updates: DEFAULT_UPDATE_PREFS,
    },
    isLoaded: true,
    isSaving: false,
    error: null,
    unsubscribeBroadcast: null,
  })
}

describe('AppSettingsDialogContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDialogStore.setState({ openDialog: null })
    useAnalyticsStore.setState({
      rangePreset: '30d',
      overview: null,
      isLoading: false,
      error: null,
    })
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      provider: { getAll: vi.fn().mockResolvedValue(providers) },
      appSettings: {
        get: vi.fn().mockResolvedValue({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
        }),
        set: vi.fn().mockImplementation(async (input) => input),
        onUpdated: vi.fn().mockReturnValue(() => {}),
      },
      analytics: {
        getOverview: vi.fn().mockResolvedValue(EMPTY_ANALYTICS_OVERVIEW),
      },
    }
  })

  it('opens, shows the stored selection, and saves it verbatim when Save is clicked', async () => {
    primeStores({
      defaultProviderId: 'codex',
      defaultModelId: 'gpt-5.4',
      defaultEffortId: 'high',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)

    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()
    expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalledWith({
        defaultProviderId: 'codex',
        defaultModelId: 'gpt-5.4',
        defaultEffortId: 'high',
        namingModelByProvider: {},
        extractionModelByProvider: {},
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
      })
    })
  })

  it('Restore defaults resets draft to first provider/default model/default effort without saving', async () => {
    primeStores({
      defaultProviderId: 'codex',
      defaultModelId: 'gpt-5.4',
      defaultEffortId: 'high',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))
    expect(window.electronAPI.appSettings.set).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalledWith({
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
        namingModelByProvider: {},
        extractionModelByProvider: {},
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
      })
    })
  })

  it('toggling a notification channel persists the new prefs on save', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })
    document.documentElement.dataset.platform = 'darwin'

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))

    fireEvent.click(screen.getByRole('switch', { name: 'Sounds' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          notifications: expect.objectContaining({ sounds: false }),
          onboarding: DEFAULT_ONBOARDING_PREFS,
        }),
      )
    })
  })

  it('Test fire button calls notifications.testFire with the chosen severity', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })
    const testFire = vi.fn().mockResolvedValue(undefined)
    ;(
      window.electronAPI as unknown as { notifications: unknown }
    ).notifications = {
      testFire,
    }

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Alert' }))

    expect(testFire).toHaveBeenCalledWith('critical')
  })

  it('renders a dedicated scroll region and lets the user switch sections', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()

    expect(screen.getByTestId('app-settings-scroll-region')).toHaveClass(
      'app-scrollbar',
      'overflow-y-auto',
    )

    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))

    expect(
      screen.getByRole('switch', { name: 'Enable notifications' }),
    ).toBeInTheDocument()
  })

  it('opens the local Insights section from settings navigation', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Insights/ }))

    expect(
      await screen.findByRole('tab', { name: 'Your Usage' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(window.electronAPI.analytics.getOverview).toHaveBeenCalledWith(
        '30d',
      )
    })
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('toggling the auto-update switch persists the new updates prefs on save', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Updates/ }))

    fireEvent.click(
      screen.getByRole('switch', { name: 'Check for updates automatically' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: { backgroundCheckEnabled: false },
        }),
      )
    })
  })

  it('Check now button calls updates.check via the store', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })
    const updatesCheck = vi.fn().mockResolvedValue({
      phase: 'checking',
      startedAt: '2026-04-22T17:00:00.000Z',
    })
    ;(window.electronAPI as unknown as { updates: unknown }).updates = {
      check: updatesCheck,
    }

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Updates/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Check now' }))
    await waitFor(() => expect(updatesCheck).toHaveBeenCalledTimes(1))
  })

  it('Cancel closes without dispatching save', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(window.electronAPI.appSettings.set).not.toHaveBeenCalled()
  })
})
