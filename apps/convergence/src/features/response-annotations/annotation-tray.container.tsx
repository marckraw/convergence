import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import {
  selectPendingAnnotations,
  useResponseAnnotationStore,
  useSessionAnnotations,
} from '@/entities/response-annotation'
import { AnnotationChip } from './annotation-chip.presentational'
import { AnnotationStrip } from './annotation-strip.presentational'
import { neighbourAfterRemoval, resolveTabStop } from './annotation-strip.pure'

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

/**
 * Where the keyboard goes after the strip changes under it. Every change here
 * unmounts the focused control — the pill that opened, the field that closed,
 * the ✕ that removed — and a keyboard left on `<body>` can neither press
 * Escape again nor arrow along the row.
 */
interface FocusRequest {
  annotationId: string
  target: 'pill' | 'chip'
}

function focusSelector({ annotationId, target }: FocusRequest): string {
  return target === 'pill'
    ? `[data-annotation-pill][data-annotation-id="${annotationId}"]`
    : `[data-annotation-expanded="${annotationId}"] button`
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
  const [lastFocusedId, setLastFocusedId] = useState<string | null>(null)
  const focusRequest = useRef<FocusRequest | null>(null)

  const pending = useMemo(
    () => selectPendingAnnotations(annotations),
    [annotations],
  )

  useEffect(() => {
    const request = focusRequest.current
    if (!request) return
    focusRequest.current = null
    document.querySelector<HTMLElement>(focusSelector(request))?.focus()
  })

  // Nothing pending takes no room: the composer must not shift down because a
  // tray is standing by empty.
  if (!sessionId || pending.length === 0) return null

  const pendingIds = pending.map((annotation) => annotation.id)

  // Discards an unsaved edit and nothing else. Crucially it does not write:
  // a collapse that saved or removed would change the sent payload.
  const resetEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  // Removal hands the keyboard to the pill beside the one that went, read
  // from the row as it stood before it went.
  const remove = (annotationId: string) => {
    const neighbour = neighbourAfterRemoval(pendingIds, annotationId)
    removeAnnotation(sessionId, annotationId)
    resetEdit()
    setExpandedId(null)
    if (neighbour !== null) {
      focusRequest.current = { annotationId: neighbour, target: 'pill' }
    }
  }

  const commitEdit = (annotationId: string) => {
    const body = editValue.trim()
    // An emptied comment is a removal — leaving a bodyless chip in the tray
    // would send a quote the user meant to take back.
    if (!body) {
      remove(annotationId)
      return
    }
    editAnnotation(sessionId, annotationId, body)
    resetEdit()
    focusRequest.current = { annotationId, target: 'chip' }
  }

  return (
    <AnnotationStrip
      annotations={pending}
      expandedId={expandedId}
      tabStopId={resolveTabStop(pendingIds, expandedId, lastFocusedId)}
      onExpand={(annotationId) => {
        resetEdit()
        setExpandedId(annotationId)
        focusRequest.current = { annotationId, target: 'chip' }
      }}
      onCollapse={() => {
        if (expandedId !== null) {
          focusRequest.current = { annotationId: expandedId, target: 'pill' }
        }
        resetEdit()
        setExpandedId(null)
      }}
      onPillFocus={setLastFocusedId}
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
          onCancelEdit={() => {
            resetEdit()
            focusRequest.current = {
              annotationId: annotation.id,
              target: 'chip',
            }
          }}
          onRemove={() => remove(annotation.id)}
        />
      )}
    />
  )
}
