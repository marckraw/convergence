import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  localProviderCatalogs,
  offeredProviders,
  providerCatalogOf,
  useSessionStore,
  type ProviderInfo,
} from '@/entities/session'
import {
  DEFAULT_DEBUG_LOGGING_PREFS,
  DEFAULT_LANES_PREFS,
  DEFAULT_FAVORITE_MODELS_PREFS,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_ONBOARDING_PREFS,
  DEFAULT_PI_MODEL_VISIBILITY_PREFS,
  DEFAULT_UPDATE_PREFS,
  useAppSettingsStore,
} from '@/entities/app-settings'
import { useAnalyticsStore, type AnalyticsOverview } from '@/entities/analytics'
import { useDialogStore } from '@/entities/dialog'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
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

function endpoint(
  id: string,
  label: string,
  baseUrl: string,
  position = 0,
): ExecutionHostEndpoint {
  return {
    id,
    label,
    baseUrl,
    position,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    configurationEpoch: 0,
  }
}

function primeStores(
  stored: {
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
  },
  executionHostEndpoints: ExecutionHostEndpoint[] = [],
) {
  useSessionStore.setState({
    sessions: [],
    globalSessions: [],
    needsYouDismissals: {},
    currentProjectId: null,
    activeSessionId: null,
    draftWorkspaceId: null,
    providerCatalogs: localProviderCatalogs(providers),
    error: null,
  })
  useAppSettingsStore.setState({
    settings: {
      ...stored,
      namingModelByProvider: {},
      extractionModelByProvider: {},
      commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
      executionHostEndpoints,
      notifications: DEFAULT_NOTIFICATION_PREFS,
      onboarding: DEFAULT_ONBOARDING_PREFS,
      updates: DEFAULT_UPDATE_PREFS,
      debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      lanes: DEFAULT_LANES_PREFS,
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
        getAll: vi
          .fn()
          .mockResolvedValue(
            providerCatalogOf('local', offeredProviders(providers)),
          ),
        getAllAvailable: vi.fn().mockResolvedValue(providers),
      },
      providerQuota: {
        list: vi.fn().mockResolvedValue([
          {
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
          },
          {
            providerId: 'claude-code',
            status: 'unavailable',
            source: 'manual',
            reason:
              'Claude Code does not expose a machine-readable usage endpoint to Convergence. The only way to compute it locally was to re-parse the shared ~/.claude transcript store, which cost more CPU than the numbers were worth. Open the Claude usage page for live limits.',
            usageUrl: 'https://claude.ai/new#settings/usage',
            lastCheckedAt: '2026-06-11T14:00:00.000Z',
            stale: false,
          },
          {
            providerId: 'cursor',
            status: 'unavailable',
            source: 'manual',
            reason:
              'Cursor ACP does not expose usage or quota counters to Convergence. Open the Cursor dashboard to inspect usage and billing.',
            usageUrl: 'https://cursor.com/dashboard',
            lastCheckedAt: '2026-06-11T14:00:00.000Z',
            stale: false,
          },
          {
            providerId: 'antigravity',
            status: 'unavailable',
            source: 'manual',
            reason:
              'Antigravity CLI exposes quota through its interactive /usage and /quota panels, but does not expose a machine-readable quota endpoint to Convergence yet. Run `agy` and use /usage or /quota for live limits.',
            usageUrl: 'https://www.antigravity.google/docs/plans',
            lastCheckedAt: '2026-06-11T14:00:00.000Z',
            stale: false,
          },
        ]),
      },
      appSettings: {
        get: vi.fn().mockResolvedValue({
          defaultProviderId: null,
          defaultModelId: null,
          defaultEffortId: null,
        }),
        set: vi.fn().mockImplementation(async (input) => input),
        sweepExecutionHostCredentials: vi.fn().mockResolvedValue([]),
        onUpdated: vi.fn().mockReturnValue(() => {}),
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
        executionHostDaemon: {
          getStatus: vi.fn().mockResolvedValue({
            providerId: 'execution-host-daemon',
            configured: false,
            source: null,
            storage: null,
            account: null,
            service: null,
            error: null,
          }),
          setToken: vi.fn(),
          deleteToken: vi.fn(),
          environmentOverride: vi.fn().mockResolvedValue({
            configured: false,
            envKey: 'CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN',
            endpointId: 'default',
          }),
        },
      },
      executionHost: {
        testRemoteConnection: vi.fn(),
        getSessionWorkspace: vi.fn(),
        sessionCountsByEndpoint: vi.fn().mockResolvedValue([]),
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
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        executionHostEndpoints: [],
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
      providerCatalogOf('local', offeredProviders(allProviders)),
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
        commandCenterShortcut: { key: 'k', shiftKey: false, altKey: false },
        executionHostEndpoints: [],
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
    expect(window.electronAPI.providerQuota.list).toHaveBeenCalledWith(
      false,
      undefined,
    )
    // Claude Code is a manual card since MAR-2401: the app says where to look
    // rather than re-parsing the transcript store to invent numbers.
    expect(
      screen.getByText('Claude Code usage unavailable'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/re-parse the shared ~\/.claude transcript store/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Cursor ACP does not expose usage or quota counters/),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))

    await waitFor(() => {
      expect(window.electronAPI.providerQuota.list).toHaveBeenCalledWith(
        true,
        undefined,
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

  it('refuses an invalid remote execution host URL: error renders and Save is disabled', async () => {
    primeStores(
      {
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      },
      [endpoint('default', 'kuba-vps', 'https://daemon.example.com')],
    )

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Execution host URL'), {
      target: { value: 'ftp://x' },
    })

    expect(
      await screen.findByText(
        'Remote execution host base URL must be a valid HTTP(S) URL.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('refuses to save a row with no address, and points at Remove', async () => {
    // Blank used to mean "unconfigure the remote host". With an explicit
    // Remove it means an unfinished row, and saving it would either throw at
    // the repository or drop a machine the user just typed.
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add endpoint/ }))

    expect(
      await screen.findByText(/Enter a base URL, or remove this endpoint/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  /**
   * MAR-2642: `'default'` is not a free slot. It is the id the single-host era's
   * sessions recorded and the Keychain account its token is filed under, so a
   * new machine that claimed it would inherit both. It used to be handed to
   * whichever row asked while no row held it — including the row added right
   * after the Endpoint that owned it was removed.
   */
  it("mints an id for a new endpoint, never reusing 'default'", async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add endpoint/ }))
    fireEvent.change(await screen.findByLabelText('Endpoint name'), {
      target: { value: 'kuba-vps' },
    })
    fireEvent.change(screen.getByLabelText('Execution host URL'), {
      target: { value: 'https://daemon.example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalled()
    })
    const saved = vi.mocked(window.electronAPI.appSettings.set).mock.calls[0][0]
      .executionHostEndpoints
    expect(saved).toEqual([
      {
        id: expect.any(String),
        label: 'kuba-vps',
        baseUrl: 'https://daemon.example.com',
      },
    ])
    expect(saved?.[0].id).not.toBe('default')
    expect(saved?.[0].id).not.toBe('')
  })

  it("does not hand 'default' to the endpoint added after it is removed", async () => {
    vi.mocked(
      window.electronAPI.executionHost.sessionCountsByEndpoint,
    ).mockResolvedValue([])
    primeStores(
      {
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      },
      [endpoint('default', 'kuba-vps', 'https://kuba.example.com')],
    )

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()
    // Wait for the count so the removal is not blocked on an unknown one.
    await waitFor(() =>
      expect(
        window.electronAPI.executionHost.sessionCountsByEndpoint,
      ).toHaveBeenCalled(),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove endpoint kuba-vps' }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Add endpoint/ }))
    fireEvent.change(await screen.findByLabelText('Endpoint name'), {
      target: { value: 'backpack-automations' },
    })
    fireEvent.change(screen.getByLabelText('Execution host URL'), {
      target: { value: 'https://backpack.example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalled()
    })
    const saved = vi.mocked(window.electronAPI.appSettings.set).mock.calls[0][0]
      .executionHostEndpoints
    expect(saved).toHaveLength(1)
    expect(saved?.[0].label).toBe('backpack-automations')
    expect(saved?.[0].id).not.toBe('default')
  })

  it('adds a second endpoint with its own id, name and address', async () => {
    primeStores(
      {
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      },
      [endpoint('default', 'kuba-vps', 'https://kuba.example.com')],
    )

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add endpoint/ }))

    const names = await screen.findAllByLabelText('Endpoint name')
    expect(names).toHaveLength(2)
    fireEvent.change(names[1], { target: { value: 'backpack-automations' } })
    fireEvent.change(screen.getAllByLabelText('Execution host URL')[1], {
      target: { value: 'https://backpack.example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalled()
    })
    const saved = vi.mocked(window.electronAPI.appSettings.set).mock.calls[0][0]
      .executionHostEndpoints
    // The first row keeps the id sessions already point at; the second is a
    // machine of its own, never a second name for the first one's token.
    expect(saved).toEqual([
      {
        id: 'default',
        label: 'kuba-vps',
        baseUrl: 'https://kuba.example.com',
      },
      {
        id: expect.any(String),
        label: 'backpack-automations',
        baseUrl: 'https://backpack.example.com',
      },
    ])
    expect(saved?.[1].id).not.toBe('default')
  })

  it('keeps an endpoint id when its address is edited, so sessions stay attached', async () => {
    // Slice 1's stability guarantee. A reissued id here would orphan every
    // session that named the endpoint and its Keychain token with them.
    primeStores(
      {
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      },
      [endpoint('kuba', 'kuba-vps', 'https://kuba.example.com')],
    )

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Execution host URL'), {
      target: { value: 'https://kuba-moved.example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          executionHostEndpoints: [
            {
              id: 'kuba',
              label: 'kuba-vps',
              baseUrl: 'https://kuba-moved.example.com',
            },
          ],
        }),
      )
    })
  })

  it('will not remove an endpoint sessions name until the cost is acknowledged', async () => {
    vi.mocked(
      window.electronAPI.executionHost.sessionCountsByEndpoint,
    ).mockResolvedValue([
      { executionHostId: 'local', sessions: 12 },
      { executionHostId: 'kuba', sessions: 2 },
    ])
    primeStores(
      {
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      },
      [endpoint('kuba', 'kuba-vps', 'https://kuba.example.com')],
    )

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove endpoint kuba-vps' }),
    )
    expect(
      await screen.findByText(/2 sessions run on “kuba-vps”/),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirm removing endpoint kuba-vps',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalledWith(
        expect.objectContaining({ executionHostEndpoints: [] }),
      )
    })
  })

  /**
   * Sessions start, finish and are deleted while Settings is closed, so a count
   * kept from the last open is a number about a different moment. A stale zero
   * would authorise a removal with no warning at all while the real count was
   * still being read — an unknown count is not a safe count.
   */
  it('re-counts on every open, so a stale zero cannot authorise a removal', async () => {
    const counts = vi.mocked(
      window.electronAPI.executionHost.sessionCountsByEndpoint,
    )
    counts.mockResolvedValueOnce([])
    primeStores(
      {
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      },
      [endpoint('kuba', 'kuba-vps', 'https://kuba.example.com')],
    )

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()
    await waitFor(() => expect(counts).toHaveBeenCalledTimes(1))

    // A count that landed and said zero: this removal costs nothing and asks
    // nothing.
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove endpoint kuba-vps' }),
    )
    expect(
      screen.queryByRole('button', { name: 'Remove endpoint kuba-vps' }),
    ).not.toBeInTheDocument()

    act(() => {
      useDialogStore.setState({ openDialog: null, payload: null })
    })
    // Second open, and this time the answer never arrives.
    counts.mockReturnValueOnce(new Promise<never>(() => {}))
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    // The stale zero is gone, so Remove has no price to act on and waits.
    const remove = screen.getByRole('button', {
      name: 'Remove endpoint kuba-vps',
    })
    expect(remove).toBeDisabled()
    fireEvent.click(remove)
    expect(
      screen.getByRole('button', { name: 'Remove endpoint kuba-vps' }),
    ).toBeInTheDocument()
  })

  /**
   * The visible consequence of "Add always mints" (MAR-2642).
   *
   * `CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN` serves exactly one Endpoint id —
   * the one the single-host era became — and Add never hands that id out again,
   * so a machine added after the original was removed cannot silently inherit
   * its credential. That refusal is right, and it leaves the variable set and
   * authenticating nothing. An invisible dead credential is the lie this era
   * exists to stop, so Settings says so.
   */
  it('says the environment override is dead when no endpoint carries its id', async () => {
    vi.mocked(
      window.electronAPI.credentials.executionHostDaemon.environmentOverride,
    ).mockResolvedValue({
      configured: true,
      envKey: 'CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN',
      endpointId: 'default',
    })
    primeStores(
      {
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      },
      [endpoint('kuba', 'kuba-vps', 'https://kuba.example.com')],
    )

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    expect(
      await screen.findByText(
        /CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN is set.*authenticates nothing/,
      ),
    ).toBeInTheDocument()
  })

  it('says nothing about the override while the endpoint it serves exists', async () => {
    vi.mocked(
      window.electronAPI.credentials.executionHostDaemon.environmentOverride,
    ).mockResolvedValue({
      configured: true,
      envKey: 'CONVERGENCE_EXECUTION_HOST_DAEMON_TOKEN',
      endpointId: 'default',
    })
    primeStores(
      {
        defaultProviderId: 'claude-code',
        defaultModelId: 'sonnet',
        defaultEffortId: 'medium',
      },
      [endpoint('default', 'Remote daemon', 'https://daemon.example.com')],
    )

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        window.electronAPI.credentials.executionHostDaemon.environmentOverride,
      ).toHaveBeenCalled(),
    )

    expect(screen.queryByText(/authenticates nothing/)).not.toBeInTheDocument()
  })

  /**
   * A removal commits the settings before it destroys the token (MAR-2642), so
   * a Keychain that refused that cleanup leaves an entry filed under an id no
   * Endpoint will ever bear again. The sweep that collects it used to ride
   * along with the settings load — and settings load once and are then kept, so
   * reopening Settings never asked again and the failed cleanup sat there until
   * the app was restarted.
   *
   * The claim was "the sweep runs when Settings is loaded". This is what makes
   * it true of reopening: every open asks, so the user whose cleanup failed
   * closes the dialog, opens it again, and the debt is collected.
   */
  it('collects the credential cleanup debt on every open, not only the first', async () => {
    primeStores({
      defaultProviderId: 'claude-code',
      defaultModelId: 'sonnet',
      defaultEffortId: 'medium',
    })

    render(<AppSettingsDialogContainer trigger={<Button>Open</Button>} />)

    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        window.electronAPI.appSettings.sweepExecutionHostCredentials,
      ).toHaveBeenCalledTimes(1),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    // Settings are loaded by now, so nothing reloads them on the second open.
    // The sweep must not be riding on that load.
    fireEvent.click(screen.getByText('Open'))
    expect(await screen.findByText('Settings')).toBeInTheDocument()

    await waitFor(() =>
      expect(
        window.electronAPI.appSettings.sweepExecutionHostCredentials,
      ).toHaveBeenCalledTimes(2),
    )
    expect(window.electronAPI.appSettings.get).toHaveBeenCalledTimes(0)
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
