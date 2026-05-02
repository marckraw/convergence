import type { FC } from 'react'
import type { DebugLoggingPrefs } from '@/entities/app-settings'
import { Button } from '@/shared/ui/button'
import { SwitchRow } from '@/shared/ui/switch'

interface DebugLoggingFieldsProps {
  prefs: DebugLoggingPrefs
  isSaving: boolean
  onToggleEnabled: (next: boolean) => void
  onOpenLogFolder: () => void
}

export const DebugLoggingFields: FC<DebugLoggingFieldsProps> = ({
  prefs,
  isSaving,
  onToggleEnabled,
  onOpenLogFolder,
}) => {
  return (
    <div className="space-y-4">
      <SwitchRow
        id="debug-logging-enabled"
        label="Capture provider debug logs"
        description="Records every event from Codex, Pi, and Claude into JSONL files for diagnosis. Files live alongside the app data and are not uploaded anywhere."
        checked={prefs.enabled}
        disabled={isSaving}
        onChange={onToggleEnabled}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenLogFolder}
          disabled={isSaving}
        >
          Open log folder
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Each session writes to a separate JSONL file. Files rotate at 10 MB and
        the oldest are removed automatically. Logs are kept for 30 days.
      </p>
    </div>
  )
}
