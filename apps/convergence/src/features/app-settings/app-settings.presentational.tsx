import type { FC, ReactElement } from 'react'
import type { AppSettingsDialogSection } from '@/entities/dialog'
import type {
  CommandCenterShortcutPrefs,
  ContextAlertSettings,
  DebugLoggingPrefs,
} from '@/entities/app-settings'
import type {
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import type {
  NotificationPrefs,
  NotificationSeverity,
} from '@/entities/notifications'
import type { UpdatePrefs, UpdateStatus } from '@/entities/updates'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import {
  Button,
  ChoiceField,
  cn,
  dialogPane,
  dialogRail,
  dialogSplit,
  EmptyState,
  FormDialog,
  ListRow,
  SectionLabel,
  SettingsSection,
  Switch,
} from '@convergence/ui'
import { SessionDefaultsFields } from './session-defaults.presentational'
import { ModelDefaultsFields } from './model-defaults-fields.presentational'
import { ExecutionHostEndpointsFields } from './execution-host-endpoints.presentational'
import type {
  ExecutionHostEndpointDraft,
  ExecutionHostSessionCounts,
} from './execution-host-settings.pure'
import { ContextAlertFields } from './context-alert-fields.presentational'
import { NotificationsFields } from './notifications-fields.presentational'
import { UpdatesFields } from './updates-fields.presentational'
import { DebugLoggingFields } from './debug-logging-fields.presentational'
import { PiModelVisibilityContainer } from './pi-model-visibility.container'
import { ProviderAccountsContainer } from './provider-accounts.container'
import { ConnectionsOverviewContainer } from './connections-overview.container'
import { ProviderCredentialsContainer } from './provider-credentials.container'
import { ProviderUsageContainer } from './provider-usage.container'
import { AnalyticsInsightsContainer } from '../analytics-insights'
import { ShortcutsFields } from './shortcuts-fields.presentational'

export type AppSettingsSectionId = AppSettingsDialogSection

interface AppSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  providers: ProviderInfo[]
  allProviders: ProviderInfo[]
  selection: ResolvedProviderSelection
  namingDraft: Record<string, string>
  extractionDraft: Record<string, string>
  executionHostEndpointsDraft: readonly ExecutionHostEndpointDraft[]
  executionHostSavedEndpoints: readonly ExecutionHostEndpoint[]
  executionHostSessionCounts: ExecutionHostSessionCounts
  /** Why the environment override serves nobody, or null. */
  executionHostEnvironmentOverrideWarning: string | null
  contextAlertDraft: ContextAlertSettings
  notificationsDraft: NotificationPrefs
  updatesDraft: UpdatePrefs
  debugLoggingDraft: DebugLoggingPrefs
  describeWorkBlocksDraft: boolean
  piModelIdsDraft: string[]
  updatesStatus: UpdateStatus
  updatesVersion: string | null
  updatesIsDev: boolean
  platform: string | null
  /** The last save that failed, in R10's words; each change saves itself. */
  error: string | null
  activeSection: AppSettingsSectionId
  onProviderChange: (id: string) => void
  onModelChange: (id: string, providerId?: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  onNamingModelChange: (providerId: string, modelId: string) => void
  onExtractionModelChange: (providerId: string, modelId: string) => void
  onAddExecutionHostEndpoint: () => void
  onExecutionHostLabelChange: (endpointId: string, value: string) => void
  onExecutionHostBaseUrlChange: (endpointId: string, value: string) => void
  onRemoveExecutionHostEndpoint: (endpointId: string) => void
  onContextAlertChange: (next: ContextAlertSettings) => void
  onNotificationsChange: (prefs: NotificationPrefs) => void
  onTestFireNotification: (severity: NotificationSeverity) => void
  onToggleBackgroundUpdates: (next: boolean) => void
  onCheckUpdates: () => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
  onOpenReleaseNotes: () => void
  onToggleDebugLogging: (next: boolean) => void
  onToggleDescribeWorkBlocks: (next: boolean) => void
  onTogglePiModel: (modelId: string, next: boolean) => void
  onOpenDebugLogFolder: () => void
  commandCenterShortcutDraft: CommandCenterShortcutPrefs
  commandCenterShortcutLabel: string
  shortcutsConflict: string | null
  isRecordingShortcut: boolean
  onStartRecordShortcut: () => void
  onRestoreCommandCenterShortcut: () => void
  onSectionChange: (section: AppSettingsSectionId) => void
  onRestoreDefaults: () => void
}

interface SettingsSection {
  id: AppSettingsSectionId
  navLabel: string
  navSummary: string
  title: string
  description: string
}

export const AppSettingsDialog: FC<AppSettingsDialogProps> = ({
  open,
  onOpenChange,
  trigger,
  providers,
  allProviders,
  selection,
  namingDraft,
  extractionDraft,
  executionHostEndpointsDraft,
  executionHostSavedEndpoints,
  executionHostSessionCounts,
  executionHostEnvironmentOverrideWarning,
  contextAlertDraft,
  notificationsDraft,
  updatesDraft,
  debugLoggingDraft,
  describeWorkBlocksDraft,
  piModelIdsDraft,
  updatesStatus,
  updatesVersion,
  updatesIsDev,
  platform,
  error,
  activeSection,
  onProviderChange,
  onModelChange,
  onEffortChange,
  onNamingModelChange,
  onExtractionModelChange,
  onAddExecutionHostEndpoint,
  onExecutionHostLabelChange,
  onExecutionHostBaseUrlChange,
  onRemoveExecutionHostEndpoint,
  onContextAlertChange,
  onNotificationsChange,
  onTestFireNotification,
  onToggleBackgroundUpdates,
  onCheckUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenReleaseNotes,
  onToggleDebugLogging,
  onToggleDescribeWorkBlocks,
  onTogglePiModel,
  onOpenDebugLogFolder,
  commandCenterShortcutDraft,
  commandCenterShortcutLabel,
  shortcutsConflict,
  isRecordingShortcut,
  onStartRecordShortcut,
  onRestoreCommandCenterShortcut,
  onSectionChange,
  onRestoreDefaults,
}) => {
  const sections: SettingsSection[] = [
    {
      id: 'session-defaults',
      navLabel: 'Session defaults',
      navSummary: 'Provider and per-task model defaults',
      title: 'Session defaults',
      description:
        'The default provider and the models Convergence uses for new sessions, naming, and forking.',
    },
    {
      id: 'credentials',
      navLabel: 'Credentials',
      navSummary: 'Provider API keys and secure storage',
      title: 'Provider credentials',
      description:
        'Paste provider API keys once. Convergence stores them in the operating system credential store and passes them to provider processes when needed.',
    },
    {
      id: 'provider-accounts',
      navLabel: 'Accounts',
      navSummary: 'Anthropic and OpenAI logins',
      title: 'Provider accounts',
      description:
        'Connect Anthropic and OpenAI accounts on this Mac. Manage each login separately and choose a default for new conversations.',
    },
    {
      id: 'usage',
      navLabel: 'Usage',
      navSummary: 'Provider quota windows and credits',
      title: 'Usage',
      description:
        'Check provider plan windows that reset automatically, including Codex five-hour and weekly limits.',
    },
    ...(allProviders.some((provider) => provider.id === 'pi')
      ? [
          {
            id: 'pi-models' as const,
            navLabel: 'Pi models',
            navSummary: 'Visible models in Pi pickers',
            title: 'Pi models',
            description:
              'Choose which Pi models appear in Convergence model pickers.',
          },
        ]
      : []),
    {
      id: 'notifications',
      navLabel: 'Notifications',
      navSummary: 'Channels, events, and test alerts',
      title: 'Notifications',
      description:
        'Control when Convergence alerts you and which delivery channels it is allowed to use.',
    },
    {
      id: 'updates',
      navLabel: 'Updates',
      navSummary: 'Version and automatic update behaviour',
      title: 'Updates',
      description:
        'Manage background update checks and trigger a manual check for a new Convergence release.',
    },
    {
      id: 'insights',
      navLabel: 'Insights',
      navSummary: 'Local usage stats and work patterns',
      title: 'Insights',
      description:
        'Review local-only analytics about your conversations, sessions, projects, and agent activity.',
    },
    {
      id: 'shortcuts',
      navLabel: 'Shortcuts',
      navSummary: 'Command Center keyboard shortcut',
      title: 'Shortcuts',
      description:
        'Customize global keyboard shortcuts. Other terminal and navigation shortcuts stay fixed for now.',
    },
    {
      id: 'debug-logging',
      navLabel: 'Debug logs',
      navSummary: 'Capture provider events to disk',
      title: 'Provider debug logs',
      description:
        'Diagnose stuck or unusual provider sessions by recording every event to a JSONL file on disk.',
    },
  ]

  const currentSection =
    sections.find((section) => section.id === activeSection) ?? sections[0]

  const renderCurrentSection = () => {
    switch (currentSection.id) {
      case 'session-defaults':
        return providers.length === 0 ? (
          <EmptyState
            title="No providers yet"
            detail="Install a provider CLI to configure defaults."
          />
        ) : (
          <div className="space-y-6">
            <SettingsSection
              title="New session"
              description="Provider, model, and reasoning effort prefilled whenever you start a new session."
            >
              <SessionDefaultsFields
                providers={providers}
                selection={selection}
                onProviderChange={onProviderChange}
                onModelChange={onModelChange}
                onEffortChange={onEffortChange}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRestoreDefaults}
              >
                Restore defaults
              </Button>
            </SettingsSection>
            <SettingsSection
              divided
              title="Session naming"
              description="Lightweight model each provider uses to auto-generate session names."
            >
              <ModelDefaultsFields
                providers={providers}
                chosen={namingDraft}
                fallback="fast"
                purpose="Session naming"
                onModelChange={onNamingModelChange}
              />
            </SettingsSection>
            <SettingsSection
              divided
              title="Session forking"
              description="Model that summarises prior conversation state before a session is forked."
            >
              <ModelDefaultsFields
                providers={providers}
                chosen={extractionDraft}
                fallback="default"
                purpose="Session forking"
                onModelChange={onExtractionModelChange}
              />
            </SettingsSection>
            <SettingsSection
              divided
              title="Work blocks"
              description="One short line under each folded block of tool steps, written after the turn ends."
            >
              <ChoiceField
                label="Describe work blocks"
                hint="Uses GPT-6 Luna on your default Codex account, one request per block of three or more steps, after each turn. Each line is checked against the block before it is shown."
              >
                <Switch
                  id="describe-work-blocks"
                  checked={describeWorkBlocksDraft}
                  onCheckedChange={(next) => onToggleDescribeWorkBlocks(next)}
                />
              </ChoiceField>
            </SettingsSection>
            <SettingsSection
              divided
              title="Context alert"
              description="When to warn you that a conversation is filling its context window, so you can seal and compact before it runs out."
            >
              <ContextAlertFields
                alert={contextAlertDraft}
                onChange={onContextAlertChange}
              />
            </SettingsSection>
            <SettingsSection
              divided
              title="Execution host endpoints"
              description="Machines other than this one that can run provider sessions, each with its own address and token. Choosing where a session runs comes per session."
            >
              <ExecutionHostEndpointsFields
                drafts={executionHostEndpointsDraft}
                savedEndpoints={executionHostSavedEndpoints}
                sessionCounts={executionHostSessionCounts}
                environmentOverrideWarning={
                  executionHostEnvironmentOverrideWarning
                }
                onAdd={onAddExecutionHostEndpoint}
                onLabelChange={onExecutionHostLabelChange}
                onBaseUrlChange={onExecutionHostBaseUrlChange}
                onRemove={onRemoveExecutionHostEndpoint}
              />
            </SettingsSection>
          </div>
        )
      case 'credentials':
        return <ProviderCredentialsContainer />
      case 'provider-accounts':
        return (
          <div className="space-y-6">
            <ConnectionsOverviewContainer />
            <ProviderAccountsContainer />
          </div>
        )
      case 'usage':
        return <ProviderUsageContainer />
      case 'notifications':
        return (
          <NotificationsFields
            prefs={notificationsDraft}
            platform={platform}
            onChange={onNotificationsChange}
            onTestFire={onTestFireNotification}
          />
        )
      case 'pi-models':
        return (
          <PiModelVisibilityContainer
            provider={allProviders.find((provider) => provider.id === 'pi')}
            selectedModelIds={piModelIdsDraft}
            onToggleModel={onTogglePiModel}
          />
        )
      case 'updates':
        return (
          <UpdatesFields
            status={updatesStatus}
            currentVersion={updatesVersion}
            prefs={updatesDraft}
            isDev={updatesIsDev}
            now={new Date()}
            onToggleBackground={onToggleBackgroundUpdates}
            onCheckNow={onCheckUpdates}
            onDownload={onDownloadUpdate}
            onInstall={onInstallUpdate}
            onOpenReleaseNotes={onOpenReleaseNotes}
          />
        )
      case 'insights':
        return <AnalyticsInsightsContainer />
      case 'shortcuts':
        return (
          <ShortcutsFields
            commandCenterShortcut={commandCenterShortcutDraft}
            commandCenterLabel={commandCenterShortcutLabel}
            conflictError={shortcutsConflict}
            isRecording={isRecordingShortcut}
            onStartRecord={onStartRecordShortcut}
            onRestoreDefault={onRestoreCommandCenterShortcut}
          />
        )
      case 'debug-logging':
        return (
          <DebugLoggingFields
            prefs={debugLoggingDraft}
            onToggleEnabled={onToggleDebugLogging}
            onOpenLogFolder={onOpenDebugLogFolder}
          />
        )
    }
  }

  const showsSectionTitle =
    currentSection.title.trim().toLowerCase() !==
    currentSection.navLabel.trim().toLowerCase()

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title="Settings"
      description="Each change is saved as you make it."
      size="2xl"
      height="tall"
      flush
      saves="as-you-go"
      error={error}
    >
      <div className={dialogSplit}>
        <aside className={cn(dialogRail, 'bg-surface/30 sm:w-64')}>
          <nav
            aria-label="Settings sections"
            className="app-scrollbar flex gap-1 overflow-x-auto p-3 sm:h-full sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto"
          >
            {sections.map((section) => (
              <ListRow
                key={section.id}
                render={
                  <button
                    type="button"
                    onClick={() => onSectionChange(section.id)}
                  />
                }
                selected={currentSection.id === section.id}
                title={section.navLabel}
                meta={section.navSummary}
                className="min-w-48 sm:min-w-0"
              />
            ))}
          </nav>
        </aside>

        <div
          data-testid="app-settings-scroll-region"
          className={cn(
            dialogPane,
            currentSection.id === 'insights' && 'px-5 lg:px-8',
          )}
        >
          <div
            className={cn(
              'mx-auto space-y-5',
              currentSection.id === 'insights' ? 'max-w-6xl' : 'max-w-2xl',
            )}
          >
            <section className="space-y-2">
              {/*
                One h3 under the dialog's h2, so the sections' h4s follow in
                order: the title when it says more than the label, else the
                label itself.
              */}
              <SectionLabel as={showsSectionTitle ? 'p' : 'h3'}>
                {currentSection.navLabel}
              </SectionLabel>
              <div>
                {showsSectionTitle ? (
                  <h3 className="text-lg font-semibold">
                    {currentSection.title}
                  </h3>
                ) : null}
                <p
                  className={cn(
                    'max-w-xl text-sm leading-relaxed text-ink-muted',
                    showsSectionTitle && 'mt-1',
                  )}
                >
                  {currentSection.description}
                </p>
              </div>
            </section>

            {renderCurrentSection()}
          </div>
        </div>
      </div>
    </FormDialog>
  )
}
