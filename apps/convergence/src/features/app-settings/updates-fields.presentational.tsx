import type { FC } from 'react'
import type { UpdatePrefs, UpdateStatus } from '@/entities/updates'
import { Button } from '@/shared/ui/button'
import { SwitchRow } from '@/shared/ui/switch'

interface UpdatesFieldsProps {
  status: UpdateStatus
  currentVersion: string | null
  prefs: UpdatePrefs
  isDev: boolean
  isSaving: boolean
  now: Date
  onToggleBackground: (next: boolean) => void
  onCheckNow: () => void
  onDownload: () => void
  onInstall: () => void
  onOpenReleaseNotes: () => void
}

export const UpdatesFields: FC<UpdatesFieldsProps> = ({
  status,
  currentVersion,
  prefs,
  isDev,
  isSaving,
  now,
  onToggleBackground,
  onCheckNow,
  onDownload,
  onInstall,
  onOpenReleaseNotes,
}) => {
  const isChecking = status.phase === 'checking'
  const isDownloading = status.phase === 'downloading'
  const actionsDisabled = isDev || isSaving || isChecking || isDownloading

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-muted-foreground">Current version</span>
        <span className="font-mono">{currentVersion ?? 'unknown'}</span>
      </div>

      <SwitchRow
        id="updates-background-check"
        label="Check for updates automatically"
        description="Check GitHub every few hours while the app is running."
        checked={prefs.backgroundCheckEnabled}
        disabled={isDev || isSaving}
        onChange={onToggleBackground}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCheckNow}
          disabled={actionsDisabled}
        >
          {isChecking ? 'Checking…' : 'Check now'}
        </Button>
        {status.phase === 'available' && (
          <Button
            type="button"
            size="sm"
            onClick={onDownload}
            disabled={isDev || isSaving}
          >
            Download v{status.version}
          </Button>
        )}
        {status.phase === 'downloaded' && (
          <Button
            type="button"
            size="sm"
            onClick={onInstall}
            disabled={isDev || isSaving}
          >
            Install v{status.version}
          </Button>
        )}
        {canShowReleaseNotes(status) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenReleaseNotes}
            disabled={isDev || isSaving}
          >
            Release notes
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {isDev
          ? 'Auto-updates are disabled in development builds.'
          : describeStatus(status, currentVersion, now)}
      </p>
    </div>
  )
}

function canShowReleaseNotes(status: UpdateStatus): boolean {
  return status.phase === 'available' || status.phase === 'downloaded'
}

export function describeStatus(
  status: UpdateStatus,
  currentVersion: string | null,
  now: Date,
): string {
  switch (status.phase) {
    case 'idle':
      if (status.lastError)
        return `Couldn't check for updates: ${status.lastError}`
      if (!status.lastChecked) return 'Never checked.'
      return `Up to date. Last checked ${formatRelative(status.lastChecked, now)}.`
    case 'checking':
      return 'Checking…'
    case 'available':
      return `Update available: v${status.version} (you're on v${currentVersion ?? 'unknown'}).`
    case 'downloading':
      return `Downloading v${status.version}… ${clampPercent(status.percent)}%`
    case 'downloaded':
      return `Update v${status.version} ready. Click Install to restart.`
    case 'not-available':
      return `Up to date (last check ${formatRelative(status.lastChecked, now)}).`
    case 'error':
      return `Couldn't check for updates: ${status.message}`
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function formatRelative(iso: string, now: Date): string {
  const then = new Date(iso).getTime()
  const delta = Math.max(0, now.getTime() - then)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}
