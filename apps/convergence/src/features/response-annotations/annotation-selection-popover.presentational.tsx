import type { FC, FormEvent } from 'react'
import { MessageSquareQuote, X } from 'lucide-react'
import { Button, IconButton, Input } from '@convergence/ui'

/**
 * The floating affordance over a selection: react in one click, or say
 * something. Render-only — the container owns the selection, the position and
 * whether the comment field is open.
 */

export const ANNOTATION_QUICK_REACTIONS = [
  '👍',
  '👎',
  '❓',
  '🎯',
  '😍',
] as const

interface AnnotationSelectionPopoverProps {
  /** Viewport coordinates of the selection, already resolved by the container. */
  position: { top: number; left: number }
  quotedExcerpt: string
  isCommenting: boolean
  commentValue: string
  onCommentValueChange: (value: string) => void
  onStartComment: () => void
  onSubmitComment: () => void
  onReact: (emoji: string) => void
  onDismiss: () => void
}

export const AnnotationSelectionPopover: FC<
  AnnotationSelectionPopoverProps
> = ({
  position,
  quotedExcerpt,
  isCommenting,
  commentValue,
  onCommentValueChange,
  onStartComment,
  onSubmitComment,
  onReact,
  onDismiss,
}) => {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmitComment()
  }

  return (
    <div
      // Fixed to the viewport because the transcript scrolls under it and the
      // selection rectangle is measured in viewport space.
      className="fixed z-50 -translate-x-1/2 -translate-y-full"
      style={{ top: position.top, left: position.left }}
      data-testid="annotation-selection-popover"
      // The transcript clears the selection on mousedown elsewhere; keeping
      // the default action here means clicking a button does not erase the
      // very selection it is about to annotate.
      onMouseDown={(event) => event.preventDefault()}
    >
      {isCommenting ? (
        <form
          onSubmit={handleSubmit}
          className="flex w-80 max-w-[80vw] flex-col gap-2 rounded-lg border border-border bg-popover p-2 shadow-lg"
        >
          <p className="line-clamp-2 border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground">
            {quotedExcerpt}
          </p>
          <div className="flex items-center gap-1.5">
            <Input
              size="md"
              autoFocus
              value={commentValue}
              onChange={(event) => onCommentValueChange(event.target.value)}
              placeholder="What about this part?"
              aria-label="Comment on the selected text"
              className="text-sm"
            />
            <Button type="submit" className="shrink-0">
              Add
            </Button>
            <IconButton
              label="Cancel comment"
              type="button"
              variant="ghost"
              onClick={onDismiss}
              className="shrink-0 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-0.5 rounded-full border border-border bg-popover p-1 shadow-lg">
          <Button
            type="button"
            variant="ghost"
            aria-label="Comment on the selected text"
            onClick={onStartComment}
            size="sm"
            className="rounded-full"
          >
            <MessageSquareQuote className="h-3.5 w-3.5" />
            Comment
          </Button>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
          {ANNOTATION_QUICK_REACTIONS.map((emoji) => (
            <IconButton
              label={`React with ${emoji}`}
              key={emoji}
              type="button"
              variant="ghost"
              onClick={() => onReact(emoji)}
              size="sm"
              className="rounded-full text-base leading-none"
            >
              {emoji}
            </IconButton>
          ))}
        </div>
      )}
    </div>
  )
}
