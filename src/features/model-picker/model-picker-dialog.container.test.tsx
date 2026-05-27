import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderInfo } from '@/entities/session'
import {
  DEFAULT_DEBUG_LOGGING_PREFS,
  DEFAULT_FAVORITE_MODELS_PREFS,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_ONBOARDING_PREFS,
  DEFAULT_PI_MODEL_VISIBILITY_PREFS,
  DEFAULT_UPDATE_PREFS,
  useAppSettingsStore,
} from '@/entities/app-settings'
import { ModelPickerDialog } from './model-picker-dialog.container'

const TEST_ATTACHMENTS = {
  supportsImage: true,
  supportsPdf: false,
  supportsText: true,
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 0,
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
    kind: 'conversation',
    supportsContinuation: true,
    defaultModelId: 'sonnet',
    modelOptions: [
      {
        id: 'sonnet',
        label: 'Claude Sonnet',
        defaultEffort: 'medium',
        effortOptions: [{ id: 'medium', label: 'Medium' }],
      },
      {
        id: 'opus',
        label: 'Claude Opus',
        defaultEffort: 'medium',
        effortOptions: [{ id: 'medium', label: 'Medium' }],
      },
    ],
    attachments: TEST_ATTACHMENTS,
    midRunInput: TEST_MID_RUN_INPUT,
  },
  {
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
        effortOptions: [{ id: 'medium', label: 'Medium' }],
      },
    ],
    attachments: TEST_ATTACHMENTS,
    midRunInput: TEST_MID_RUN_INPUT,
  },
]

function primeSettings(favoriteModels = DEFAULT_FAVORITE_MODELS_PREFS): void {
  useAppSettingsStore.setState({
    settings: {
      defaultProviderId: null,
      defaultModelId: null,
      defaultEffortId: null,
      namingModelByProvider: {},
      extractionModelByProvider: {},
      notifications: DEFAULT_NOTIFICATION_PREFS,
      onboarding: DEFAULT_ONBOARDING_PREFS,
      updates: DEFAULT_UPDATE_PREFS,
      debugLogging: DEFAULT_DEBUG_LOGGING_PREFS,
      piModelVisibility: DEFAULT_PI_MODEL_VISIBILITY_PREFS,
      favoriteModels,
    },
    isLoaded: true,
    isSaving: false,
    error: null,
    unsubscribeBroadcast: null,
  })
}

describe('ModelPickerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      appSettings: {
        get: vi.fn(),
        set: vi.fn().mockImplementation(async (input) => input),
        onUpdated: vi.fn().mockReturnValue(() => {}),
      },
    }
    primeSettings()
  })

  it('toggles a favorite without selecting or closing the picker', async () => {
    const onChange = vi.fn()
    render(
      <ModelPickerDialog
        providers={providers}
        selectedProviderId={null}
        selectedModelId={null}
        value="Select model"
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Select model' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add Claude Opus to favorites',
      }),
    )

    await waitFor(() => {
      expect(window.electronAPI.appSettings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          favoriteModels: {
            items: [{ providerId: 'claude-code', modelId: 'opus' }],
          },
        }),
      )
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Search models...')).toBeInTheDocument()
  })

  it('sorts favorites first and filters to favorites from the sidebar', async () => {
    primeSettings({
      items: [{ providerId: 'codex', modelId: 'gpt-5.4' }],
    })
    render(
      <ModelPickerDialog
        providers={providers}
        selectedProviderId={null}
        selectedModelId={null}
        value="Select model"
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Select model' }))

    await screen.findByText('GPT-5.4')
    const dialogText = screen.getByRole('dialog').textContent ?? ''
    expect(dialogText.indexOf('GPT-5.4')).toBeLessThan(
      dialogText.indexOf('Claude Sonnet'),
    )

    fireEvent.click(screen.getByRole('button', { name: /Favorites/ }))

    expect(screen.getByText('GPT-5.4')).toBeInTheDocument()
    expect(screen.queryByText('Claude Sonnet')).not.toBeInTheDocument()
    expect(screen.queryByText('Claude Opus')).not.toBeInTheDocument()
  })
})
