import type { FC, FormEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { ProjectContextReinjectMode } from '@/entities/project-context'
import {
  Button,
  ChoiceField,
  Field,
  FieldDescription,
  FieldLabel,
  FormError,
  Input,
  Notice,
  Switch,
  Textarea,
} from '@convergence/ui'

interface ProjectContextFormProps {
  mode: 'create' | 'edit'
  label: string
  body: string
  reinjectMode: ProjectContextReinjectMode
  isSaving: boolean
  error: string | null
  onLabelChange: (value: string) => void
  onBodyChange: (value: string) => void
  onReinjectModeChange: (mode: ProjectContextReinjectMode) => void
  onSubmit: () => void
  onCancel: () => void
}

export const ProjectContextForm: FC<ProjectContextFormProps> = ({
  mode,
  label,
  body,
  reinjectMode,
  isSaving,
  error,
  onLabelChange,
  onBodyChange,
  onReinjectModeChange,
  onSubmit,
  onCancel,
}) => {
  const isEveryTurn = reinjectMode === 'every-turn'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-line-soft bg-surface/30 p-4"
      data-testid="project-context-form"
    >
      <Field disabled={isSaving}>
        <FieldLabel>
          Label <span className="text-xs text-ink-muted">(optional)</span>
        </FieldLabel>
        <Input
          size="lg"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          placeholder="e.g. monorepo-api"
        />
      </Field>

      <Field disabled={isSaving}>
        <FieldLabel>Body</FieldLabel>
        <Textarea
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder="Free-text context. Plain prose works well."
          rows={6}
          required
        />
        <FieldDescription>{body.trim().length} characters</FieldDescription>
      </Field>

      <div className="space-y-2">
        <ChoiceField
          label="Re-inject every turn"
          hint="Off (default) injects this item only at session start."
          disabled={isSaving}
        >
          <Switch
            id="project-context-reinject"
            checked={isEveryTurn}
            onCheckedChange={(checked) =>
              onReinjectModeChange(checked ? 'every-turn' : 'boot')
            }
          />
        </ChoiceField>
        {isEveryTurn ? (
          <Notice
            tone="warning"
            icon={<AlertTriangle />}
            title="Re-sent with every message"
            data-testid="every-turn-warning"
          >
            They cost tokens and can conflict with the provider&apos;s own
            session memory. Use sparingly.
          </Notice>
        ) : null}
      </div>

      <FormError>{error}</FormError>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSaving}
          size="lg"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabledReason={
            body.trim().length === 0 ? 'Write the body first.' : undefined
          }
          pending={isSaving}
          pendingLabel="Saving…"
          size="lg"
        >
          {mode === 'create' ? 'Add context item' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
