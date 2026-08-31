import type { FC, FormEvent } from 'react'
import type { ResponseAnnotation } from '@/entities/response-annotation'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Check, Pencil, X } from 'lucide-react'
import { toChipExcerpt } from './annotation-selection.pure'

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
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-1"
      >
        <span className="min-w-0 max-w-[16rem] truncate text-xs italic text-muted-foreground">
          {excerpt}
        </span>
        <Input
          autoFocus
          value={editValue}
          onChange={(event) => onEditValueChange(event.target.value)}
          aria-label={`Edit response to “${excerpt}”`}
          className="h-6 w-40 text-xs"
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancelEdit()
          }}
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="h-4 w-4 rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Save response"
        >
          <Check className="h-3 w-3" />
        </Button>
      </form>
    )
  }

  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-foreground"
      data-testid="annotation-chip"
    >
      <span className="min-w-0 max-w-[16rem] truncate italic text-muted-foreground">
        {excerpt}
      </span>
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        →
      </span>
      <span className="min-w-0 max-w-[12rem] truncate">{annotation.body}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-4 w-4 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        aria-label={`Edit response to “${excerpt}”`}
        onClick={onStartEdit}
      >
        <Pencil className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-4 w-4 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        aria-label={`Remove response to “${excerpt}”`}
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </span>
  )
}
