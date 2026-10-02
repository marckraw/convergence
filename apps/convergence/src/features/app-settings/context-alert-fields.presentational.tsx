import type { FC } from 'react'
import type { ContextAlertSettings } from '@/entities/app-settings'
import {
  ChoiceField,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Switch,
} from '@convergence/ui'

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
    <ChoiceField
      label="Warn me when a conversation fills up"
      hint="Turns the context dot amber and raises one notification when a turn ends above your threshold."
      disabled={isSaving}
    >
      <Switch
        id="context-alert-enabled"
        checked={alert.enabled}
        onCheckedChange={(enabled) => onChange({ ...alert, enabled })}
      />
    </ChoiceField>

    <div className="grid gap-3 sm:grid-cols-2">
      <Field>
        <FieldLabel>Alert at % of the window</FieldLabel>
        <Input
          size="lg"
          type="number"
          min={MIN_PERCENT}
          max={MAX_PERCENT}
          step={1}
          value={alert.percent}
          disabled={isSaving || !alert.enabled}
          onChange={(event) => {
            const percent = clampPercent(event.target.value)
            if (percent === null) return
            onChange({ ...alert, percent })
          }}
        />
      </Field>

      <Field>
        <FieldLabel>…or at this many tokens</FieldLabel>
        <Input
          size="lg"
          type="number"
          min={MIN_TOKENS}
          step={1000}
          value={alert.tokens ?? ''}
          disabled={isSaving || !alert.enabled}
          onChange={(event) =>
            onChange({ ...alert, tokens: clampTokens(event.target.value) })
          }
        />
        <FieldDescription>
          Empty = no token cap. Whichever limit is reached first raises the
          alert.
        </FieldDescription>
      </Field>
    </div>
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
