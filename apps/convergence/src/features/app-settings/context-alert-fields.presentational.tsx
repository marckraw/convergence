import type { FC } from 'react'
import type { ContextAlertSettings } from '@/entities/app-settings'
import { Input } from '@/shared/ui/input'
import { SwitchRow } from '@/shared/ui/switch'

interface ContextAlertFieldsProps {
  alert: ContextAlertSettings
  isSaving?: boolean
  onChange: (next: ContextAlertSettings) => void
}

/** The percent range the stored-settings parser keeps as given. */
const MIN_PERCENT = 1
const MAX_PERCENT = 99
/** The token floor the stored-settings parser keeps as given. */
const MIN_TOKENS = 1000

/**
 * The context alert's three controls (MAR-3250).
 *
 * Both numbers are clamped to the range the settings parser accepts, so the
 * dialog can only emit a threshold that survives a round trip unchanged --
 * a typed 0 comes back as 1 in front of the user rather than as a silent 75
 * after the save.
 */
export const ContextAlertFields: FC<ContextAlertFieldsProps> = ({
  alert,
  isSaving = false,
  onChange,
}) => (
  <div className="space-y-4">
    <SwitchRow
      id="context-alert-enabled"
      label="Warn me when a conversation fills up"
      description="Turns the context dot amber and raises one notification when a turn ends above your threshold."
      checked={alert.enabled}
      disabled={isSaving}
      onChange={(enabled) => onChange({ ...alert, enabled })}
    />

    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm">
        <span className="block text-muted-foreground">
          Alert at % of the window
        </span>
        <Input
          type="number"
          min={MIN_PERCENT}
          max={MAX_PERCENT}
          step={1}
          value={alert.percent}
          disabled={isSaving || !alert.enabled}
          aria-label="Alert at % of the window"
          onChange={(event) => {
            const percent = clampPercent(event.target.value)
            if (percent === null) return
            onChange({ ...alert, percent })
          }}
        />
      </label>

      <label className="space-y-1.5 text-sm">
        <span className="block text-muted-foreground">
          …or at this many tokens
        </span>
        <Input
          type="number"
          min={MIN_TOKENS}
          step={1000}
          value={alert.tokens ?? ''}
          disabled={isSaving || !alert.enabled}
          aria-label="…or at this many tokens"
          onChange={(event) =>
            onChange({ ...alert, tokens: clampTokens(event.target.value) })
          }
        />
      </label>
    </div>

    <p className="text-xs leading-relaxed text-muted-foreground">
      Empty = no token cap. Whichever limit is reached first raises the alert.
    </p>
  </div>
)

/**
 * A typed percent, clamped into range, or null when the field says nothing a
 * percent could be made of -- which leaves the saved value alone rather than
 * inventing one mid-keystroke.
 */
export function clampPercent(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return null
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, parsed))
}

/**
 * A typed token cap: null for an empty field, which is the real choice "no
 * absolute cap" and not a missing answer.
 */
export function clampTokens(raw: string): number | null {
  if (raw.trim() === '') return null
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return null
  return Math.max(MIN_TOKENS, parsed)
}
