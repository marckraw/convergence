import type { FC } from 'react'
import type { CommandCenterShortcutPrefs } from '@/entities/app-settings'
import { Button, FormError, SettingsSection } from '@convergence/ui'

interface ShortcutsFieldsProps {
  commandCenterShortcut: CommandCenterShortcutPrefs
  commandCenterLabel: string
  conflictError: string | null
  isRecording: boolean
  /** Locks the buttons while something else saves. */
  isSaving?: boolean
  onStartRecord: () => void
  onRestoreDefault: () => void
}

export const ShortcutsFields: FC<ShortcutsFieldsProps> = ({
  commandCenterShortcut,
  commandCenterLabel,
  conflictError,
  isRecording,
  isSaving = false,
  onStartRecord,
  onRestoreDefault,
}) => (
  <div className="space-y-4">
    <SettingsSection
      compact
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
        <FormError>{conflictError}</FormError>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="tonal"
            disabled={isSaving || isRecording}
            onClick={onStartRecord}
          >
            {isRecording ? 'Listening…' : 'Record shortcut'}
          </Button>
          <Button
            type="button"
            variant="ghost"
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
    </SettingsSection>
  </div>
)
