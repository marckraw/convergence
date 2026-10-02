import type { FC, ReactNode } from 'react'
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  Field,
  FieldLabel,
  IconButton,
  Input,
  settingsHeading,
} from '@convergence/ui'

interface SecretFieldProps {
  /** Its heading: what the secret is for ("OpenRouter", "Daemon API token"). */
  title: string
  /** What is stored now, in a line under the heading. */
  status: string
  /** The field's label ("API key"). */
  label: string
  /** The word on its buttons: "key" makes "Save key", "Replace key", "Remove key…". */
  noun: string
  /**
   * Whose secret it is, where a card holds several (an endpoint's name):
   * each control is named for it, so nothing reaches another's by accident.
   */
  owner?: string
  /** What is typed, never the stored secret. */
  value: string
  placeholder: string
  /** The typed secret is shown as text. */
  revealed: boolean
  /** A secret is stored: Save becomes Replace, and Remove can act. */
  configured: boolean
  /** Saving or removing is under way. */
  saving: boolean
  /** Why the secret can't be changed now (the endpoint isn't ready), or null. */
  blocked?: string | null
  /** More actions for the secret, before Remove (Test connection). */
  actions?: ReactNode
  /** A line between the heading and the field, such as why a test waits. */
  note?: ReactNode
  /** What happened, under the field: Notices. */
  children?: ReactNode
  onValueChange: (value: string) => void
  onToggleReveal: () => void
  onSave: () => void
  /** Remove: the caller asks first (R5); the button says so with "…". */
  onRemove: () => void
}

/**
 * A secret the app keeps in the Keychain (DLG-28): the OpenRouter API key
 * and each execution host's daemon token, one part where there were two
 * drifted copies. Its heading and what is stored, then the field with its
 * show/hide button and Save (or Replace). Save is busy while it saves and,
 * like Remove…, says why it can't act when it can't (R2).
 */
export const SecretField: FC<SecretFieldProps> = ({
  title,
  status,
  label,
  noun,
  owner,
  value,
  placeholder,
  revealed,
  configured,
  saving,
  blocked = null,
  actions,
  note,
  children,
  onValueChange,
  onToggleReveal,
  onSave,
  onRemove,
}) => {
  const forOwner = owner ? ` for ${owner}` : ''
  const saveVerb = configured ? 'Replace' : 'Save'
  return (
    <Card render={<section />} padding="md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound aria-hidden className="size-4 text-ink-muted" />
            <h4 className={settingsHeading}>{title}</h4>
          </div>
          <p className="text-sm text-ink-muted">{status}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {actions}
          <Button
            type="button"
            variant="ghost"
            aria-label={owner ? `Remove ${noun}${forOwner}` : undefined}
            onClick={onRemove}
            disabled={saving}
            disabledReason={
              saving
                ? undefined
                : (blocked ?? (configured ? undefined : `No ${noun} is saved.`))
            }
          >
            <Trash2 aria-hidden className="size-4" />
            Remove {noun}…
          </Button>
        </div>
      </div>

      {note}

      <Field className="mt-4">
        <FieldLabel>{label}</FieldLabel>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              size="lg"
              type={revealed ? 'text' : 'password'}
              autoComplete="off"
              value={value}
              placeholder={placeholder}
              onChange={(event) => onValueChange(event.target.value)}
              disabled={saving || blocked !== null}
              className="pr-10"
            />
            <IconButton
              label={`${revealed ? 'Hide' : 'Show'} ${owner ? noun : label}${forOwner}`}
              type="button"
              variant="ghost"
              onClick={onToggleReveal}
              disabled={saving}
              size="lg"
              className="absolute top-0 right-0"
            >
              {revealed ? (
                <EyeOff aria-hidden className="size-4" />
              ) : (
                <Eye aria-hidden className="size-4" />
              )}
            </IconButton>
          </div>
          <Button
            type="button"
            aria-label={owner ? `${saveVerb} ${noun}${forOwner}` : undefined}
            onClick={onSave}
            pending={saving}
            pendingLabel="Saving…"
            disabledReason={
              saving
                ? undefined
                : (blocked ??
                  (value.trim().length === 0
                    ? `Paste a ${noun} first.`
                    : undefined))
            }
            size="lg"
          >
            {saveVerb} {noun}
          </Button>
        </div>
      </Field>

      {children}
    </Card>
  )
}
