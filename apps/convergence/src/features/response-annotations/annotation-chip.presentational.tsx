import type { FC, FormEvent } from 'react'
import type { ResponseAnnotation } from '@/entities/response-annotation'
import { IconButton, Input } from '@convergence/ui'
import { Check, Pencil, X } from 'lucide-react'
import { toChipExcerpt } from './annotation-selection.pure'
import { annotationChipFrame, annotationQuote } from './annotation.styles'

/**
 * One pending annotation, waiting to be sent. Same visual family as the
 * skill-selection chips — this is the same idea (something attached to the
 * next message), so it should not look like a different mechanism.
 */

interface AnnotationChipProps {
  annotation: ResponseAnnotation
  isEditing: boolean
  editValue: string
  onEditValueChange: (value: string) => void
  onStartEdit: () => void
  onSubmitEdit: () => void
  onCancelEdit: () => void
  onRemove: () => void
}

export const AnnotationChip: FC<AnnotationChipProps> = ({
  annotation,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  onRemove,
}) => {
  const excerpt = toChipExcerpt(annotation.quotedText)

  if (isEditing) {
    const handleSubmit = (event: FormEvent) => {
      event.preventDefault()
      onSubmitEdit()
    }

    return (
      <form
        onSubmit={handleSubmit}
        // Escape in the edit form discards the draft and nothing more: the
        // press stops here, so the chip stays open and a second Escape is
        // what closes it (MAR-3004 lap 2). Held on the form, not the field,
        // so Escape from the Save button is the same first stage.
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          onCancelEdit()
        }}
        className={annotationChipFrame}
      >
        <span className={annotationQuote}>{excerpt}</span>
        <Input
          size="xs"
          autoFocus
          value={editValue}
          onChange={(event) => onEditValueChange(event.target.value)}
          aria-label={`Edit response to “${excerpt}”`}
          className="w-40 text-xs"
        />
        <IconButton
          label="Save response"
          type="submit"
          variant="quiet"
          size="xs"
        >
          <Check aria-hidden className="size-3" />
        </IconButton>
      </form>
    )
  }

  return (
    <span className={annotationChipFrame} data-testid="annotation-chip">
      <span className={annotationQuote}>{excerpt}</span>
      <span aria-hidden="true" className="shrink-0 text-ink-muted">
        →
      </span>
      <span className="min-w-0 max-w-48 truncate">{annotation.body}</span>
      <IconButton
        label={`Edit response to “${excerpt}”`}
        type="button"
        variant="quiet"
        onClick={onStartEdit}
        size="xs"
        className="shrink-0"
      >
        <Pencil aria-hidden className="size-3" />
      </IconButton>
      <IconButton
        label={`Remove response to “${excerpt}”`}
        type="button"
        variant="quiet"
        onClick={onRemove}
        size="xs"
        className="shrink-0"
      >
        <X aria-hidden className="size-3" />
      </IconButton>
    </span>
  )
}
