import type { FC } from 'react'
import { Field, FieldLabel, FormDialog, Input, Textarea } from '@convergence/ui'

interface SpaceCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  brief: string
  isSubmitting: boolean
  error: string | null
  onTitleChange: (value: string) => void
  onBriefChange: (value: string) => void
  onSubmit: () => void
  /** The key that also creates it, in words ("⌘↵"), for Create's tooltip. */
  submitShortcut?: string
}

export const SpaceCreateDialog: FC<SpaceCreateDialogProps> = ({
  open,
  onOpenChange,
  title,
  brief,
  isSubmitting,
  error,
  onTitleChange,
  onBriefChange,
  onSubmit,
  submitShortcut,
}) => (
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    title="New Space"
    description="Create a durable Chat context for related attempts."
    saves="on-save"
    onSave={onSubmit}
    saveShortcut={submitShortcut}
    saveLabel="Create Space"
    pendingLabel="Creating…"
    pending={isSubmitting}
    saveDisabledReason={
      title.trim().length === 0 ? 'Give the Space a title first.' : undefined
    }
    error={error}
  >
    <div className="space-y-5">
      <Field disabled={isSubmitting}>
        <FieldLabel>Title</FieldLabel>
        <Input
          size="lg"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Launch plan"
          autoFocus
        />
      </Field>

      <Field disabled={isSubmitting}>
        <FieldLabel>Initial brief</FieldLabel>
        <Textarea
          value={brief}
          onChange={(event) => onBriefChange(event.target.value)}
          placeholder="Purpose, constraints, and useful background."
          className="min-h-28"
        />
      </Field>
    </div>
  </FormDialog>
)
