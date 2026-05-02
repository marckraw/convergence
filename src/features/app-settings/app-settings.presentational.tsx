import type { FC, ReactNode } from 'react'
import type { AppSettingsDialogSection } from '@/entities/dialog'
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { SessionDefaultsFields } from './session-defaults.presentational'
import { NamingModelDefaultsFields } from './naming-model-defaults.presentational'
import { ExtractionModelDefaultsFields } from './extraction-model-defaults.presentational'
import { NotificationsFields } from './notifications-fields.presentational'
import { UpdatesFields } from './updates-fields.presentational'
import { AnalyticsInsightsContainer } from '../analytics-insights'
import { WorkboardSettings } from '../workboard-settings'

export type AppSettingsSectionId = AppSettingsDialogSection

interface AppSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  namingDraft: Record<string, string>
  extractionDraft: Record<string, string>
  notificationsDraft: NotificationPrefs
  updatesDraft: UpdatePrefs
  updatesStatus: UpdateStatus
  updatesVersion: string | null
  updatesIsDev: boolean
  platform: string | null
  isSaving: boolean
  error: string | null
  activeSection: AppSettingsSectionId
  onProviderChange: (id: string) => void
  onModelChange: (id: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  onNamingModelChange: (providerId: string, modelId: string) => void
  onExtractionModelChange: (providerId: string, modelId: string) => void
  onNotificationsChange: (prefs: NotificationPrefs) => void
  onTestFireNotification: (severity: NotificationSeverity) => void
  onToggleBackgroundUpdates: (next: boolean) => void
  onCheckUpdates: () => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
  onOpenReleaseNotes: () => void
  onSectionChange: (section: AppSettingsSectionId) => void
  onSave: () => void
  onCancel: () => void
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
  selection,
  namingDraft,
  extractionDraft,
  notificationsDraft,
  updatesDraft,
  updatesStatus,
  updatesVersion,
  updatesIsDev,
  platform,
  isSaving,
  error,
  activeSection,
  onProviderChange,
  onModelChange,
  onEffortChange,
  onNamingModelChange,
  onExtractionModelChange,
  onNotificationsChange,
  onTestFireNotification,
  onToggleBackgroundUpdates,
  onCheckUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onOpenReleaseNotes,
  onSectionChange,
  onSave,
  onCancel,
  onRestoreDefaults,
}) => {
  const sections: SettingsSection[] = [
    {
      id: 'session-defaults',
      navLabel: 'Session defaults',
      navSummary: 'Provider, model, and reasoning effort',
      title: 'Session defaults',
      description:
        'Choose the provider stack Convergence should prefill whenever you start a new session.',
    },
    {
      id: 'workboard',
      navLabel: 'Workboard',
      navSummary: 'Trackers, tokens, and project routing',
      title: 'Agent Workboard',
      description:
        'Configure global Linear and Jira sources, then route synced issues to local Convergence projects.',
    },
    ...(providers.length > 0
      ? [
          {
            id: 'session-naming' as const,
            navLabel: 'Session naming',
            navSummary: 'Auto-generated titles by provider',
            title: 'Session naming',
            description:
              'Pick the lightweight model each provider should use when Convergence generates session names.',
          },
          {
            id: 'session-forking' as const,
            navLabel: 'Session forking',
            navSummary: 'Summaries used while forking',
            title: 'Session forking',
            description:
              'Choose the model that summarises prior conversation state before a session is forked.',
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
  ]

  const currentSection =
    sections.find((section) => section.id === activeSection) ?? sections[0]

  const renderCurrentSection = () => {
    switch (currentSection.id) {
      case 'session-defaults':
        return providers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/35 px-4 py-5">
            <p className="text-sm text-muted-foreground">
              No providers are available yet. Install Claude Code or Codex to
              configure defaults.
            </p>
          </div>
        ) : (
          <SessionDefaultsFields
            providers={providers}
            selection={selection}
            onProviderChange={onProviderChange}
            onModelChange={onModelChange}
            onEffortChange={onEffortChange}
          />
        )
      case 'workboard':
        return <WorkboardSettings />
      case 'session-naming':
        return (
          <NamingModelDefaultsFields
            providers={providers}
            namingDraft={namingDraft}
            onNamingModelChange={onNamingModelChange}
          />
        )
      case 'session-forking':
        return (
          <ExtractionModelDefaultsFields
            providers={providers}
            extractionDraft={extractionDraft}
            onExtractionModelChange={onExtractionModelChange}
          />
        )
      case 'notifications':
        return (
          <NotificationsFields
            prefs={notificationsDraft}
            platform={platform}
            isSaving={isSaving}
            onChange={onNotificationsChange}
            onTestFire={onTestFireNotification}
          />
        )
      case 'updates':
        return (
          <UpdatesFields
            status={updatesStatus}
            currentVersion={updatesVersion}
            prefs={updatesDraft}
            isDev={updatesIsDev}
            isSaving={isSaving}
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
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={cn(
          'p-0',
          currentSection.id === 'insights'
            ? 'w-[min(1280px,calc(100vw-2rem))] max-h-[min(92vh,960px)]'
            : 'w-[min(960px,calc(100vw-2rem))]',
        )}
      >
        <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            App-wide configuration for Convergence.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="shrink-0 border-b border-border/70 bg-card/30 sm:w-64 sm:border-r sm:border-b-0">
            <nav
              aria-label="Settings sections"
              className="app-scrollbar flex gap-2 overflow-x-auto px-3 py-3 sm:h-full sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden"
            >
              {sections.map((section) => {
                const isActive = currentSection.id === section.id

                return (
                  <Button
                    key={section.id}
                    type="button"
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="sm"
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'h-auto min-w-48 items-start justify-start rounded-xl px-3 py-3 text-left sm:min-w-0',
                      isActive && 'ring-1 ring-ring',
                    )}
                    onClick={() => onSectionChange(section.id)}
                  >
                    <span className="flex flex-col gap-1">
                      <span className="text-sm font-medium">
                        {section.navLabel}
                      </span>
                      <span className="whitespace-normal text-[11px] leading-relaxed text-muted-foreground">
                        {section.navSummary}
                      </span>
                    </span>
                  </Button>
                )
              })}
            </nav>
          </aside>

          <div className="min-h-0 flex-1">
            <div
              data-testid="app-settings-scroll-region"
              className={cn(
                'app-scrollbar min-h-0 h-full overflow-y-auto py-5',
                currentSection.id === 'insights' ? 'px-5 lg:px-8' : 'px-6',
              )}
            >
              <div
                className={cn(
                  'mx-auto space-y-5',
                  currentSection.id === 'insights' ? 'max-w-6xl' : 'max-w-2xl',
                )}
              >
                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {currentSection.navLabel}
                  </p>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {currentSection.title}
                    </h3>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                      {currentSection.description}
                    </p>
                  </div>
                </section>

                {renderCurrentSection()}

                {error && (
                  <p
                    className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {currentSection.id === 'session-defaults' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRestoreDefaults}
                disabled={providers.length === 0 || isSaving}
              >
                Restore defaults
              </Button>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant={
                  currentSection.id === 'insights' ||
                  currentSection.id === 'workboard'
                    ? 'default'
                    : 'outline'
                }
                size="sm"
                onClick={onCancel}
                disabled={isSaving}
              >
                {currentSection.id === 'insights' ||
                currentSection.id === 'workboard'
                  ? 'Done'
                  : 'Cancel'}
              </Button>
            </DialogClose>
            {currentSection.id === 'insights' ||
            currentSection.id === 'workboard' ? null : (
              <Button
                type="button"
                size="sm"
                onClick={onSave}
                disabled={providers.length === 0 || isSaving}
              >
                Save
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
