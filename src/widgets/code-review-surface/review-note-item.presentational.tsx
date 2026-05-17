import type { FC } from 'react'
import { CheckCircle2, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import type { ReviewNote } from '@/entities/review-note'
import { formatReviewNoteLocation } from '@/features/code-review-notes'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'

interface ReviewNoteItemProps {
  note: ReviewNote
  active: boolean
  stale: boolean
  editing: boolean
  editingBody: string
  onJumpToNote: (note: ReviewNote) => void
  onEditNote: (note: ReviewNote) => void
  onEditingBodyChange: (value: string) => void
  onCancelEdit: () => void
  onSaveNote: (noteId: string) => void
  onResolveNote: (note: ReviewNote) => void
  onReopenNote: (note: ReviewNote) => void
  onDeleteNote: (note: ReviewNote) => void
}

export const ReviewNoteItem: FC<ReviewNoteItemProps> = ({
  note,
  active,
  stale,
  editing,
  editingBody,
  onJumpToNote,
  onEditNote,
  onEditingBodyChange,
  onCancelEdit,
  onSaveNote,
  onResolveNote,
  onReopenNote,
  onDeleteNote,
}) => (
  <div
    className={cn(
      'rounded border border-border/70 bg-card/70 p-2',
      active && 'border-primary/60 bg-primary/10',
      note.state === 'resolved' && 'opacity-70',
    )}
  >
    <div className="mb-1 flex items-start justify-between gap-2">
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-w-0 flex-1 justify-start rounded px-1 py-0 text-left font-normal"
        onClick={() => onJumpToNote(note)}
        title="Jump to review note"
      >
        <span className="truncate text-[11px] text-muted-foreground">
          {formatReviewNoteLocation(note)}
        </span>
      </Button>
      <div className="flex shrink-0 items-center gap-1">
        {stale ? (
          <span
            className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive"
            title="Saved line anchor is not present in the current diff"
          >
            stale
          </span>
        ) : null}
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {note.state}
        </span>
        {note.state === 'resolved' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onReopenNote(note)}
            title="Reopen review note"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onResolveNote(note)}
            title="Resolve review note"
          >
            <CheckCircle2 className="h-3 w-3" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onEditNote(note)}
          title="Edit review note"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onDeleteNote(note)}
          title="Delete review note"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
    {editing ? (
      <div className="space-y-2">
        <Textarea
          value={editingBody}
          onChange={(event) => onEditingBodyChange(event.target.value)}
          className="min-h-16 resize-none text-xs"
          aria-label="Edit review note body"
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onCancelEdit}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={editingBody.trim().length === 0}
            onClick={() => onSaveNote(note.id)}
          >
            Save
          </Button>
        </div>
      </div>
    ) : (
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-full justify-start rounded px-1 py-1 text-left font-normal"
        onClick={() => onJumpToNote(note)}
      >
        <span className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
          {note.body}
        </span>
      </Button>
    )}
  </div>
)
