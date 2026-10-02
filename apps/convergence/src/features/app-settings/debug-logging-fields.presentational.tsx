import type { FC } from 'react'
import type { DebugLoggingPrefs } from '@/entities/app-settings'
import { Button, ChoiceField, Switch } from '@convergence/ui'

interface DebugLoggingFieldsProps {
  prefs: DebugLoggingPrefs
  /** Locks the controls while something else saves. */
  isSaving?: boolean
  onToggleEnabled: (next: boolean) => void
  onOpenLogFolder: () => void
}

export const DebugLoggingFields: FC<DebugLoggingFieldsProps> = ({
  prefs,
  isSaving = false,
  onToggleEnabled,
  onOpenLogFolder,
}) => {
  return (
    <div className="space-y-4">
      <ChoiceField
        label="Capture provider debug logs"
        hint="Records every provider event Convergence can observe into JSONL files for diagnosis. Files live alongside the app data and are not uploaded anywhere."
        disabled={isSaving}
      >
        <Switch
          id="debug-logging-enabled"
          checked={prefs.enabled}
          onCheckedChange={(next) => onToggleEnabled(next)}
        />
      </ChoiceField>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onOpenLogFolder}
          disabled={isSaving}
        >
          Open log folder
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        Each session writes to a separate JSONL file. Files rotate at 10 MB and
        the oldest are removed automatically. Logs are kept for 30 days.
      </p>
    </div>
  )
}
