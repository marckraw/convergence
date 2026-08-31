import { useMemo, useState, type FC } from 'react'
import {
  selectPendingAnnotations,
  useResponseAnnotationStore,
  useSessionAnnotations,
} from '@/entities/response-annotation'
import { AnnotationChip } from './annotation-chip.presentational'

/**
 * What the next message will carry, above the composer.
 *
 * Composed by the widgets rather than rendered inside the composer: the
 * composer is a feature, this is a feature, and features may not import each
 * other. The widget that renders both is the only place they can meet.
 */

interface AnnotationTrayProps {
  sessionId: string | null
}

export const AnnotationTray: FC<AnnotationTrayProps> = ({ sessionId }) => {
  const annotations = useSessionAnnotations(sessionId)
  const editAnnotation = useResponseAnnotationStore(
    (state) => state.editAnnotation,
  )
  const removeAnnotation = useResponseAnnotationStore(
    (state) => state.removeAnnotation,
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const pending = useMemo(
    () => selectPendingAnnotations(annotations),
    [annotations],
  )

  // Nothing pending takes no room: the composer must not shift down because a
  // tray is standing by empty.
  if (!sessionId || pending.length === 0) return null

  const commitEdit = (annotationId: string) => {
    const body = editValue.trim()
    // An emptied comment is a removal — leaving a bodyless chip in the tray
    // would send a quote the user meant to take back.
    if (body) {
      editAnnotation(sessionId, annotationId, body)
    } else {
      removeAnnotation(sessionId, annotationId)
    }
    setEditingId(null)
    setEditValue('')
  }

  return (
    <div
      className="mx-auto mb-2 flex w-full max-w-2xl flex-wrap items-center gap-1.5"
      data-testid="annotation-tray"
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Responding to
      </span>
      {pending.map((annotation) => (
        <AnnotationChip
          key={annotation.id}
          annotation={annotation}
          isEditing={editingId === annotation.id}
          editValue={editValue}
          onEditValueChange={setEditValue}
          onStartEdit={() => {
            setEditingId(annotation.id)
            setEditValue(annotation.body)
          }}
          onSubmitEdit={() => commitEdit(annotation.id)}
          onCancelEdit={() => {
            setEditingId(null)
            setEditValue('')
          }}
          onRemove={() => removeAnnotation(sessionId, annotation.id)}
        />
      ))}
    </div>
  )
}
