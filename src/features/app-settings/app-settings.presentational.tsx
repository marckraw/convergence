import type { FC, ReactNode } from 'react'
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
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { SessionDefaultsFields } from './session-defaults.presentational'
import { NamingModelDefaultsFields } from './naming-model-defaults.presentational'
import { ExtractionModelDefaultsFields } from './extraction-model-defaults.presentational'
import { NotificationsFields } from './notifications-fields.presentational'
import { UpdatesFields } from './updates-fields.presentational'

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
  onSave: () => void
  onCancel: () => void
  onRestoreDefaults: () => void
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
  onSave,
  onCancel,
  onRestoreDefaults,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent>
      <div className="flex flex-col gap-4 px-6 py-5">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            App-wide defaults used every time you start a new session.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Session defaults
          </h3>
          {providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No providers are available yet. Install Claude Code or Codex to
              configure defaults.
            </p>
          ) : (
            <SessionDefaultsFields
              providers={providers}
              selection={selection}
              onProviderChange={onProviderChange}
              onModelChange={onModelChange}
              onEffortChange={onEffortChange}
            />
          )}
        </section>

        {providers.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              Session naming
            </h3>
            <NamingModelDefaultsFields
              providers={providers}
              namingDraft={namingDraft}
              onNamingModelChange={onNamingModelChange}
            />
          </section>
        )}

        {providers.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              Session forking
            </h3>
            <ExtractionModelDefaultsFields
              providers={providers}
              extractionDraft={extractionDraft}
              onExtractionModelChange={onExtractionModelChange}
            />
          </section>
        )}

        <section className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Notifications
          </h3>
          <NotificationsFields
            prefs={notificationsDraft}
            platform={platform}
            isSaving={isSaving}
            onChange={onNotificationsChange}
            onTestFire={onTestFireNotification}
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Updates
          </h3>
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
        </section>

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRestoreDefaults}
            disabled={providers.length === 0 || isSaving}
          >
            Restore defaults
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={providers.length === 0 || isSaving}
          >
            Save
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
)
