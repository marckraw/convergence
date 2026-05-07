import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import {
  getReviewNoteAnnotationElementId,
  type ReviewNoteDiffAnnotationMetadata,
} from './review-notes.pure'

interface ReviewNoteDiffAnnotationProps {
  metadata: ReviewNoteDiffAnnotationMetadata
}

const STATE_CLASS = {
  draft: 'border-primary/50 bg-primary/10',
  sent: 'border-cyan-500/50 bg-cyan-500/10',
  resolved: 'border-muted-foreground/30 bg-muted/40 opacity-75',
} satisfies Record<ReviewNoteDiffAnnotationMetadata['note']['state'], string>

export const ReviewNoteDiffAnnotation: FC<ReviewNoteDiffAnnotationProps> = ({
  metadata,
}) => {
  const { note, active } = metadata

  return (
    <div
      id={getReviewNoteAnnotationElementId(note.id)}
      className={cn(
        'my-1 rounded border px-2 py-1.5 text-xs text-foreground shadow-sm',
        STATE_CLASS[note.state],
        active && 'ring-1 ring-primary/70',
      )}
      data-review-note-annotation-id={note.id}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Review note
        </span>
        <span className="rounded border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {note.state}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed">
        {note.body}
      </p>
    </div>
  )
}
