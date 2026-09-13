import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import {
  selectPendingAnnotations,
  useResponseAnnotationStore,
  useSessionAnnotations,
} from '@/entities/response-annotation'
import { AnnotationChip } from './annotation-chip.presentational'
import { AnnotationStrip } from './annotation-strip.presentational'

/**
 * What the next message will carry, above the composer.
 *
 * Composed by the widgets rather than rendered inside the composer: the
 * composer is a feature, this is a feature, and features may not import each
 * other. The widget that renders both is the only place they can meet.
 *
 * Laid out as one sideways-scrolling strip of compact pills (MAR-3004), with
 * at most one expanded. Expanding and collapsing are VIEW state only: they
 * never touch the store, so what the composer compiles on send is exactly what
 * it compiled before the strip existed. The only paths to the store are the
 * two they always were — saving an edit and removing an annotation.
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  // The pill to give focus back to after a collapse, so Escape leaves the
  // keyboard where it was instead of dropping it on the page.
  const returnFocusTo = useRef<string | null>(null)

  const pending = useMemo(
    () => selectPendingAnnotations(annotations),
    [annotations],
  )

  useEffect(() => {
    const annotationId = returnFocusTo.current
    if (!annotationId || expandedId !== null) return
    returnFocusTo.current = null
    document
      .querySelector<HTMLElement>(
        `[data-annotation-pill][data-annotation-id="${annotationId}"]`,
      )
      ?.focus()
  })

  // Nothing pending takes no room: the composer must not shift down because a
  // tray is standing by empty.
  if (!sessionId || pending.length === 0) return null

  // Discards an unsaved edit and nothing else. Crucially it does not write:
  // a collapse that saved or removed would change the sent payload.
  const resetEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  const commitEdit = (annotationId: string) => {
    const body = editValue.trim()
    // An emptied comment is a removal — leaving a bodyless chip in the tray
    // would send a quote the user meant to take back.
    if (body) {
      editAnnotation(sessionId, annotationId, body)
    } else {
      removeAnnotation(sessionId, annotationId)
    }
    resetEdit()
  }

  return (
    <AnnotationStrip
      annotations={pending}
      expandedId={expandedId}
      onExpand={(annotationId) => {
        resetEdit()
        setExpandedId(annotationId)
      }}
      onCollapse={() => {
        returnFocusTo.current = expandedId
        resetEdit()
        setExpandedId(null)
      }}
      renderExpanded={(annotation) => (
        <AnnotationChip
          annotation={annotation}
          isEditing={editingId === annotation.id}
          editValue={editValue}
          onEditValueChange={setEditValue}
          onStartEdit={() => {
            setEditingId(annotation.id)
            setEditValue(annotation.body)
          }}
          onSubmitEdit={() => commitEdit(annotation.id)}
          onCancelEdit={resetEdit}
          onRemove={() => {
            removeAnnotation(sessionId, annotation.id)
            resetEdit()
            setExpandedId(null)
          }}
        />
      )}
    />
  )
}
