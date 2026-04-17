import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import { Button } from '@/shared/ui/button'
import { AppSettingsDialogContainer } from './app-settings.container'

const providers = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
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
  },
  {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
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
  },
]

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
    settings: stored,
    isLoaded: true,
    isSaving: false,
    error: null,
    unsubscribeBroadcast: null,
  })
}

describe('AppSettingsDialogContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      })
    })
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
