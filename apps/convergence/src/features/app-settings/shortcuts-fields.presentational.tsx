import type { FC } from 'react'
import type { CommandCenterShortcutPrefs } from '@/entities/app-settings'
import { Button } from '@/shared/ui/button'
import { SettingsControlField } from './settings-control-field.presentational'

interface ShortcutsFieldsProps {
  commandCenterShortcut: CommandCenterShortcutPrefs
  commandCenterLabel: string
  conflictError: string | null
  isRecording: boolean
  isSaving: boolean
  onStartRecord: () => void
  onRestoreDefault: () => void
}

export const ShortcutsFields: FC<ShortcutsFieldsProps> = ({
  commandCenterShortcut,
  commandCenterLabel,
  conflictError,
  isRecording,
  isSaving,
  onStartRecord,
  onRestoreDefault,
}) => (
  <div className="space-y-4">
    <SettingsControlField
      title="Open Command Center"
      description="Global shortcut for the command palette. Uses the primary modifier for your platform (⌘ on macOS, Ctrl elsewhere)."
    >
      <div className="space-y-2">
        <div
          className="flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-3 font-mono text-sm"
          aria-live="polite"
        >
          {isRecording ? 'Press a shortcut…' : commandCenterLabel}
        </div>
        {conflictError ? (
          <p className="text-xs text-destructive" role="alert">
            {conflictError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isSaving || isRecording}
            onClick={onStartRecord}
          >
            {isRecording ? 'Listening…' : 'Record shortcut'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={
              isSaving ||
              isRecording ||
              (commandCenterShortcut.key === 'k' &&
                !commandCenterShortcut.shiftKey &&
                !commandCenterShortcut.altKey)
            }
            onClick={onRestoreDefault}
          >
            Restore default
          </Button>
        </div>
      </div>
    </SettingsControlField>
  </div>
)
