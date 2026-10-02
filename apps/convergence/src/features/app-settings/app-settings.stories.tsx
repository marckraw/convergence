import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor, within } from 'storybook/test'
import {
  DEFAULT_COMMAND_CENTER_SHORTCUT,
  DEFAULT_CONTEXT_ALERT,
  DEFAULT_DEBUG_LOGGING_PREFS,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_UPDATE_PREFS,
} from '@/entities/app-settings'
import { resolveProviderSelection, type ProviderInfo } from '@/entities/session'
import { Button } from '@convergence/ui'
import { AppSettingsDialog } from './app-settings.presentational'

/*
 * Settings, shown on the sections that hold no container of their own.
 * Credentials, Accounts, Usage, Pi models and Insights each mount a container
 * that asks the main process for its state, so their stories are their
 * parts' own (ProviderAccounts, ProviderUsage, AnalyticsInsights …).
 */

const claude: ProviderInfo = {
  id: 'claude-code',
  name: 'Claude Code',
  vendorLabel: 'Anthropic',
  kind: 'conversation',
  supportsContinuation: true,
  supportsConversationReset: true,
  defaultModelId: 'claude-opus-5-5',
  fastModelId: 'claude-haiku-4-5',
  modelOptions: [
    {
      id: 'claude-opus-5-5',
      label: 'Claude Opus 5.5',
      defaultEffort: 'high',
      effortOptions: [
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
      ],
    },
    {
      id: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
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
}

const providers = [claude]

const meta = {
  title: 'Features/AppSettings/AppSettingsDialog',
  component: AppSettingsDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    trigger: <Button variant="secondary">Settings</Button>,
    providers,
    allProviders: providers,
    selection: resolveProviderSelection(
      providers,
      'claude-code',
      'claude-opus-5-5',
      'high',
    ),
    namingDraft: {},
    extractionDraft: {},
    executionHostEndpointsDraft: [],
    executionHostSavedEndpoints: [],
    executionHostSessionCounts: { status: 'counting' },
    executionHostEnvironmentOverrideWarning: null,
    contextAlertDraft: DEFAULT_CONTEXT_ALERT,
    notificationsDraft: DEFAULT_NOTIFICATION_PREFS,
    updatesDraft: DEFAULT_UPDATE_PREFS,
    debugLoggingDraft: DEFAULT_DEBUG_LOGGING_PREFS,
    describeWorkBlocksDraft: false,
    piModelIdsDraft: [],
    updatesStatus: { phase: 'idle', lastChecked: null, lastError: null },
    updatesVersion: '0.98.0',
    updatesIsDev: false,
    platform: 'darwin',
    error: null,
    activeSection: 'session-defaults',
    onProviderChange: fn(),
    onModelChange: fn(),
    onEffortChange: fn(),
    onNamingModelChange: fn(),
    onExtractionModelChange: fn(),
    onAddExecutionHostEndpoint: fn(),
    onExecutionHostLabelChange: fn(),
    onExecutionHostBaseUrlChange: fn(),
    onRemoveExecutionHostEndpoint: fn(),
    onContextAlertChange: fn(),
    onNotificationsChange: fn(),
    onTestFireNotification: fn(),
    onToggleBackgroundUpdates: fn(),
    onCheckUpdates: fn(),
    onDownloadUpdate: fn(),
    onInstallUpdate: fn(),
    onOpenReleaseNotes: fn(),
    onToggleDebugLogging: fn(),
    onToggleDescribeWorkBlocks: fn(),
    onTogglePiModel: fn(),
    onOpenDebugLogFolder: fn(),
    commandCenterShortcutDraft: DEFAULT_COMMAND_CENTER_SHORTCUT,
    commandCenterShortcutLabel: '⌘K',
    shortcutsConflict: null,
    isRecordingShortcut: false,
    onStartRecordShortcut: fn(),
    onRestoreCommandCenterShortcut: fn(),
    onSectionChange: fn(),
    onRestoreDefaults: fn(),
  },
} satisfies Meta<typeof AppSettingsDialog>

export default meta

type Story = StoryObj<typeof meta>

const openSettings = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Settings' })
  await waitFor(() =>
    expect(
      dialog.getAnimations().filter((a) => a.playState === 'running'),
    ).toHaveLength(0),
  )
  return dialog
}

/**
 * Session defaults: the sections down the side, the chosen one marked, and
 * one Done, because each change is saved as it is made (R6).
 */
export const Default: Story = {
  play: async ({ args, userEvent }) => {
    const dialog = await openSettings()
    await expect(dialog).toHaveAccessibleDescription(
      'Each change is saved as you make it.',
    )
    const nav = within(dialog).getByRole('navigation', {
      name: 'Settings sections',
    })
    await expect(
      within(nav).getByRole('button', { name: /Session defaults/ }),
    ).toHaveAttribute('aria-current', 'true')
    await expect(
      within(dialog).queryByRole('button', { name: 'Save' }),
    ).toBeNull()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Restore defaults' }),
    )
    await expect(args.onRestoreDefaults).toHaveBeenCalledOnce()
    await userEvent.click(within(nav).getByRole('button', { name: /Updates/ }))
    await expect(args.onSectionChange).toHaveBeenCalledWith('updates')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

/** Notifications: a switch saves as it turns. */
export const Notifications: Story = {
  args: { activeSection: 'notifications' },
  play: async ({ args, userEvent }) => {
    const dialog = await openSettings()
    await userEvent.click(
      within(dialog).getByRole('switch', { name: 'Sounds' }),
    )
    await expect(args.onNotificationsChange).toHaveBeenCalledWith(
      expect.objectContaining({ sounds: !DEFAULT_NOTIFICATION_PREFS.sounds }),
    )
  },
}

/** Empty: no provider yet, so there are no defaults to set. */
export const Empty: Story = {
  args: { providers: [], allProviders: [] },
  play: async () => {
    const dialog = await openSettings()
    await expect(within(dialog).getByText('No providers yet')).toBeVisible()
  },
}

/** Failed: the save that didn't take is announced over Done. */
export const Failed: Story = {
  args: {
    activeSection: 'shortcuts',
    error: "Couldn't save the settings. The disk is full.",
  },
  play: async () => {
    const dialog = await openSettings()
    await expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'The disk is full.',
    )
  },
}

export const Dark: Story = {
  args: { activeSection: 'updates' },
  globals: { theme: 'dark' },
  play: async () => {
    await openSettings()
  },
}
