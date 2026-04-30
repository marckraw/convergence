import type { FC, FormEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { ProjectContextReinjectMode } from '@/entities/project-context'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { SwitchRow } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'

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
      className="space-y-4 rounded-lg border border-border/60 bg-card/30 p-4"
      data-testid="project-context-form"
    >
      <div className="space-y-2">
        <label htmlFor="project-context-label" className="text-sm font-medium">
          Label{' '}
          <span className="text-xs text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="project-context-label"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          placeholder="e.g. monorepo-api"
          disabled={isSaving}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="project-context-body" className="text-sm font-medium">
          Body
        </label>
        <Textarea
          id="project-context-body"
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder="Free-text context. Plain prose works well."
          rows={6}
          disabled={isSaving}
          required
        />
        <p className="text-xs text-muted-foreground">
          {body.trim().length} characters
        </p>
      </div>

      <div className="space-y-2">
        <SwitchRow
          id="project-context-reinject"
          label="Re-inject every turn"
          description="Off (default) injects this item only at session start."
          checked={isEveryTurn}
          disabled={isSaving}
          onChange={(checked) =>
            onReinjectModeChange(checked ? 'every-turn' : 'boot')
          }
        />
        {isEveryTurn ? (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200"
            data-testid="every-turn-warning"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Every-turn items are re-sent on every message. They cost tokens
              and can conflict with the provider&apos;s own session memory. Use
              sparingly.
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving || body.trim().length === 0}>
          {isSaving
            ? 'Saving...'
            : mode === 'create'
              ? 'Add context item'
              : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
