import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore, type ProviderInfo } from '@/entities/session'
import {
  DEFAULT_DEBUG_LOGGING_PREFS,
  DEFAULT_FAVORITE_MODELS_PREFS,
  DEFAULT_GUIDED_REVIEW_BACKEND,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_ONBOARDING_PREFS,
  DEFAULT_PI_MODEL_VISIBILITY_PREFS,
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

const providers: ProviderInfo[] = [
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

const piProvider: ProviderInfo = {
  id: 'pi',
  name: 'Pi',
  vendorLabel: 'Pi',
  kind: 'conversation',
  supportsContinuation: true,
  defaultModelId: 'openrouter/custom-qwen',
  modelOptions: [
    {
      id: 'openrouter/custom-qwen',
      label: 'PGX-test Qwen',
      defaultEffort: 'medium',
      effortOptions: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
      ],
      source: 'pi-models-json',
    },
    {
      id: 'openai/gpt-5.5',
      label: 'OpenAI GPT-5.5',
      defaultEffort: 'medium',
      effortOptions: [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
      ],
      source: 'provider',
    },
  ],
  attachments: TEST_ATTACHMENTS,
  midRunInput: TEST_MID_RUN_INPUT,
}

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
  modelUsage: [],
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
      guidedReviewModelByProvider: {},
      commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
      guidedReviewBackend: DEFAULT_GUIDED_REVIEW_BACKEND,
      guidedReviewRemoteBaseUrl: null,
      executionHostRemoteBaseUrl: null,
      notifications: DEFAULT_NOTIFICATION_PREFS,
      onboarding: DEFAULT_ONBOARDING_PREFS,
      updates: DEFAULT_UPDATE_PREFS,
      debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
      favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
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
    useDialogStore.setState({ openDialog: null, payload: null })
    useAnalyticsStore.setState({
      rangePreset: '30d',
      overview: null,
      isLoading: false,
      isGeneratingProfile: false,
      error: null,
    })
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      provider: {
        getAll: vi.fn().mockResolvedValue(providers),
        getAllAvailable: vi.fn().mockResolvedValue(providers),
      },
      providerQuota: {
        getCodex: vi.fn().mockResolvedValue({
          providerId: 'codex',
          status: 'available',
          source: 'provider-api',
          planType: 'plus',
          windows: [
            {
              kind: 'five-hour',
              label: '5 hour usage limit',
              usedPercent: 4,
              remainingPercent: 96,
              windowMinutes: 300,
              resetsAt: '2026-05-21T15:21:00.000Z',
            },
          ],
          credits: null,
          limitReachedType: null,
          lastCheckedAt: '2026-05-21T12:00:00.000Z',
          stale: false,
        }),
        getClaude: vi.fn().mockResolvedValue({
          providerId: 'claude-code',
          status: 'available',
          source: 'local-usage-log',
          planType: null,
          windows: [
            {
              kind: 'five-hour',
              label: 'Current 5-hour Claude usage',
              usedPercent: 60,
              remainingPercent: 40,
              windowMinutes: 300,
              resetsAt: '2026-06-11T16:00:00.000Z',
              displayMode: 'observed-usage',
              valueLabel: '18.1M tokens, $38.82',
              resetLabel: 'Ends',
            },
            {
              kind: 'weekly',
              label: "This week's Claude usage",
              usedPercent: 63,
              remainingPercent: 37,
              windowMinutes: 10_080,
              resetsAt: '2026-06-14T00:00:00.000Z',
              displayMode: 'observed-usage',
              valueLabel: '191.2M tokens, $285.73',
              resetLabel: 'Ends',
            },
          ],
          credits: null,
          limitReachedType: null,
          lastCheckedAt: '2026-06-11T14:00:00.000Z',
          stale: false,
        }),
      },
      appSettings: {
        get: vi.fn().mockResolvedValue({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
        }),
        set: vi.fn().mockImplementation(async (input) => input),
        onUpdated: vi.fn().mockReturnValue(() => {}),
      },
      codeReviewGuide: {
        testRemoteDaemonConnection: vi.fn().mockResolvedValue({
          ok: true,
          state: 'connected',
          baseUrl: 'https://daemon.example.com',
          message: 'Connected to agents-daemon.',
          health: null,
          meta: null,
        }),
      },
      credentials: {
        openRouter: {
          getStatus: vi.fn().mockResolvedValue({
            providerId: 'openrouter',
            configured: false,
            source: null,
            storage: null,
            account: null,
            service: null,
            error: null,
          }),
          setToken: vi.fn().mockResolvedValue({
            providerId: 'openrouter',
            configured: true,
            source: 'keychain',
            storage: 'keychain',
            account: 'default',
            service: 'convergence.openrouter',
            error: null,
          }),
          deleteToken: vi.fn().mockResolvedValue({
            providerId: 'openrouter',
            configured: false,
            source: null,
            storage: null,
            account: null,
            service: null,
            error: null,
          }),
        },
        guidedReviewDaemon: {
          getStatus: vi.fn().mockResolvedValue({
            providerId: 'guided-review-daemon',
            configured: false,
            source: null,
            storage: null,
            account: null,
            service: null,
            error: null,
          }),
          setToken: vi.fn().mockResolvedValue({
            providerId: 'guided-review-daemon',
            configured: true,
            source: 'keychain',
            storage: 'keychain',
            account: 'default',
            service: 'convergence.guided-review-daemon',
            error: null,
          }),
          deleteToken: vi.fn().mockResolvedValue({
            providerId: 'guided-review-daemon',
            configured: false,
            source: null,
            storage: null,
            account: null,
            service: null,
            error: null,
          }),
        },
      },
      analytics: {
        getOverview: vi.fn().mockResolvedValue(EMPTY_ANALYTICS_OVERVIEW),
        generateWorkProfile: vi.fn(),
        deleteWorkProfileSnapshot: vi.fn(),
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
        guidedReviewModelByProvider: {},
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        guidedReviewBackend: DEFAULT_GUIDED_REVIEW_BACKEND,
        guidedReviewRemoteBaseUrl: null,
        executionHostRemoteBaseUrl: null,
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
        piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
        favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
      })
    })
  })

  it('persists selected additional Pi models and reloads filtered providers after save', async () => {
    const allProviders = [...providers, piProvider]
    vi.mocked(window.electronAPI.provider.getAll).mockResolvedValue(
      allProviders,
    )
    vi.mocked(window.electronAPI.provider.getAllAvailable).mockResolvedValue(
      allProviders,
    )
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Pi models/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /OpenAI GPT-5\.5/ }))
    const providerLoadsBeforeSave = vi.mocked(
      window.electronAPI.provider.getAll,
    ).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          piModelVisibility: { additionalModelIds: ['openai/gpt-5.5'] },
        }),
      )
    })
    await waitFor(() => {
      expect(
        vi.mocked(window.electronAPI.provider.getAll).mock.calls.length,
      ).toBeGreaterThan(providerLoadsBeforeSave)
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
        guidedReviewModelByProvider: {},
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        guidedReviewBackend: DEFAULT_GUIDED_REVIEW_BACKEND,
        guidedReviewRemoteBaseUrl: null,
        executionHostRemoteBaseUrl: null,
        notifications: DEFAULT_NOTIFICATION_PREFS,
        onboarding: DEFAULT_ONBOARDING_PREFS,
        updates: DEFAULT_UPDATE_PREFS,
        debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
        piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
        favoriteModels: DEFAULT_FAVORITE_MODELS_PREFS,
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

  it('keeps the larger Insights dialog dimensions for every settings section', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass(
      'h-[min(92vh,960px)]',
      'w-[min(1280px,calc(100vw-2rem))]',
      'max-h-[min(92vh,960px)]',
    )

    fireEvent.click(screen.getByRole('button', { name: /Insights/ }))

    expect(await screen.findByRole('tab', { name: 'Your Usage' })).toBeVisible()
    expect(dialog).toHaveClass(
      'h-[min(92vh,960px)]',
      'w-[min(1280px,calc(100vw-2rem))]',
      'max-h-[min(92vh,960px)]',
    )
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

  it('opens provider usage and refreshes provider quota without saving app settings', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Usage/ }))

    expect(await screen.findByText('5 hour usage limit')).toBeInTheDocument()
    expect(screen.getByText(/96%/)).toBeInTheDocument()
    expect(window.electronAPI.providerQuota.getCodex).toHaveBeenCalledWith(
      false,
    )
    expect(window.electronAPI.providerQuota.getClaude).toHaveBeenCalledWith(
      false,
    )
    expect(screen.getByText('Current 5-hour Claude usage')).toBeInTheDocument()
    expect(screen.getByText('18.1M tokens, $38.82')).toBeInTheDocument()
    expect(
      screen.getByText(/Cursor ACP does not expose usage or quota counters/),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))

    await waitFor(() => {
      expect(window.electronAPI.providerQuota.getCodex).toHaveBeenCalledWith(
        true,
      )
      expect(window.electronAPI.providerQuota.getClaude).toHaveBeenCalledWith(
        true,
      )
    })
    expect(window.electronAPI.appSettings.set).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('opens directly to Insights from a dialog payload', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })
    useDialogStore.setState({
      openDialog: 'app-settings',
      payload: { appSettingsSection: 'insights' },
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)

    expect(
      await screen.findByRole('tab', { name: 'Your Usage' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(window.electronAPI.analytics.getOverview).toHaveBeenCalledWith('30d')
  })

  it('saves an OpenRouter API key from the Credentials section without saving app settings', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Credentials/ }))
    expect(await screen.findByText('Provider credentials')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-or-test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }))

    await waitFor(() => {
      expect(
        window.electronAPI.credentials.openRouter.setToken,
      ).toHaveBeenCalledWith('sk-or-test')
    })
    expect(window.electronAPI.appSettings.set).not.toHaveBeenCalled()
    expect(await screen.findByText('OpenRouter API key saved.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('saves remote guided review settings and daemon token separately', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()

    expect(await screen.findByText('Generation backend')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remote daemon' }))
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://daemon.example.com/' },
    })
    fireEvent.change(screen.getByLabelText('Token'), {
      target: { value: 'daemon-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save token' }))

    await waitFor(() => {
      expect(
        window.electronAPI.credentials.guidedReviewDaemon.setToken,
      ).toHaveBeenCalledWith('daemon-token')
    })
    expect(await screen.findByText('Daemon API token saved.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    await waitFor(() => {
      expect(
        window.electronAPI.codeReviewGuide.testRemoteDaemonConnection,
      ).toHaveBeenCalled()
    })
    expect(await screen.findByText('Connected to agents-daemon.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          guidedReviewBackend: 'remote',
          guidedReviewRemoteBaseUrl: 'https://daemon.example.com/',
        }),
      )
    })
  })

  it('shows remote guided review daemon connection failures without saving settings', async () => {
    vi.mocked(
      window.electronAPI.codeReviewGuide.testRemoteDaemonConnection,
    ).mockResolvedValue({
      ok: false,
      state: 'auth-failed',
      baseUrl: 'https://daemon.example.com',
      message: 'Invalid API token',
      health: null,
      meta: null,
    })
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()
    expect(await screen.findByText('Generation backend')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText('Invalid API token')).toBeVisible()
    expect(window.electronAPI.appSettings.set).not.toHaveBeenCalled()
  })

  it('blocks saving remote guided review settings until the daemon URL is valid', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))

    expect(await screen.findByText('Settings')).toBeInTheDocument()
    expect(await screen.findByText('Generation backend')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remote daemon' }))
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'ftp://daemon.example.com' },
    })

    expect(
      await screen.findByText(
        'Remote daemon base URL must be a valid HTTP(S) URL.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(window.electronAPI.appSettings.set).not.toHaveBeenCalled()
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

  it('saves a custom Command Center shortcut from Shortcuts settings', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Shortcuts/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record shortcut' }))

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'p',
          metaKey: true,
          bubbles: true,
        }),
      )
    })

    expect(await screen.findByText('⌘P')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          commandCenterShortcut: { key: 'p', shiftKey: false, altKey: false },
        }),
      )
    })
  })

  it('blocks saving a Command Center shortcut that conflicts with terminal bindings', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Shortcuts/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record shortcut' }))

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 't',
          metaKey: true,
          bubbles: true,
        }),
      )
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Terminal new tab',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(window.electronAPI.appSettings.set).not.toHaveBeenCalled()
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
