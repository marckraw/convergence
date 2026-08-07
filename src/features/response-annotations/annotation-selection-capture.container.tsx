import { useCallback, useEffect, useState, type FC } from 'react'
import { useResponseAnnotationStore } from '@/entities/response-annotation'
import {
  buildAnnotationAnchor,
  toChipExcerpt,
  type AnnotationAnchor,
} from './annotation-selection.pure'
import { AnnotationSelectionPopover } from './annotation-selection-popover.presentational'

/**
 * Watches for a selection inside an annotatable message and offers to capture
 * it (RA2).
 *
 * The transcript marks its own annotatable messages with
 * `data-annotation-message-id`; this listens at the document and asks the DOM
 * which message a selection landed in. That direction matters for layering:
 * the widget owns the transcript and simply labels it, while this feature owns
 * the interaction — no import crosses the wrong way.
 */

/**
 * Set by the transcript on **completed agent messages only**. A message still
 * streaming has no attribute, so it offers nothing to select — which is the
 * whole of ruling 5's "mid-stream messages are not annotatable", enforced by
 * absence rather than by a condition someone can forget.
 */
export const ANNOTATION_MESSAGE_ID_ATTRIBUTE = 'data-annotation-message-id'

interface CapturedSelection {
  messageId: string
  anchor: AnnotationAnchor
  position: { top: number; left: number }
}

interface AnnotationSelectionCaptureProps {
  sessionId: string | null
}

export const AnnotationSelectionCapture: FC<
  AnnotationSelectionCaptureProps
> = ({ sessionId }) => {
  const addAnnotation = useResponseAnnotationStore(
    (state) => state.addAnnotation,
  )
  const [capture, setCapture] = useState<CapturedSelection | null>(null)
  const [isCommenting, setIsCommenting] = useState(false)
  const [commentValue, setCommentValue] = useState('')

  const dismiss = useCallback(() => {
    setCapture(null)
    setIsCommenting(false)
    setCommentValue('')
  }, [])

  useEffect(() => {
    if (!sessionId) return undefined

    const readSelection = () => {
      // Never re-read while a comment is being typed: the field steals focus
      // from the selection, and re-reading would dismiss the popover the user
      // is currently writing into.
      if (isCommenting) return

      const next = resolveSelectionCapture()
      setCapture(next)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }

    document.addEventListener('mouseup', readSelection)
    document.addEventListener('keyup', readSelection)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mouseup', readSelection)
      document.removeEventListener('keyup', readSelection)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [dismiss, isCommenting, sessionId])

  if (!sessionId || !capture) return null

  const commit = (body: string, kind: 'comment' | 'reaction') => {
    const trimmed = body.trim()
    if (!trimmed) return

    addAnnotation(sessionId, {
      messageId: capture.messageId,
      quotedText: capture.anchor.quotedText,
      prefix: capture.anchor.prefix,
      suffix: capture.anchor.suffix,
      body: trimmed,
      kind,
    })
    // The quote now lives in a chip, so the highlight has done its job.
    window.getSelection()?.removeAllRanges()
    dismiss()
  }

  return (
    <AnnotationSelectionPopover
      position={capture.position}
      quotedExcerpt={toChipExcerpt(capture.anchor.quotedText)}
      isCommenting={isCommenting}
      commentValue={commentValue}
      onCommentValueChange={setCommentValue}
      onStartComment={() => setIsCommenting(true)}
      onSubmitComment={() => commit(commentValue, 'comment')}
      onReact={(emoji) => commit(emoji, 'reaction')}
      onDismiss={dismiss}
    />
  )
}

/**
 * The DOM half, kept in one function: what is selected, which message it
 * belongs to, and where to float the affordance.
 */
function resolveSelectionCapture(): CapturedSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }

  const range = selection.getRangeAt(0)
  const messageElement = findAnnotatableMessage(range.commonAncestorContainer)
  const messageId = messageElement?.getAttribute(
    ANNOTATION_MESSAGE_ID_ATTRIBUTE,
  )
  if (!messageElement || !messageId) return null

  const anchor = buildAnnotationAnchor({
    messageText: messageElement.textContent ?? '',
    selectedText: selection.toString(),
  })
  if (!anchor) return null

  const rect = readRangeRect(range)
  return {
    messageId,
    anchor,
    position: { top: rect.top - 8, left: rect.left + rect.width / 2 },
  }
}

/**
 * Where the selection sits on screen, or the top-left corner if the range
 * cannot be measured. This runs inside a document-level listener, so throwing
 * here would surface as an unhandled error with no failing user action to
 * explain it — and a popover in the wrong place still lets the work happen.
 */
function readRangeRect(range: Range): {
  top: number
  left: number
  width: number
} {
  try {
    const rect = range.getBoundingClientRect?.()
    if (rect) return { top: rect.top, left: rect.left, width: rect.width }
  } catch {
    // Fall through to the corner.
  }
  return { top: 0, left: 0, width: 0 }
}

function findAnnotatableMessage(node: Node | null): Element | null {
  const element =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : (node?.parentElement ?? null)

  return element?.closest(`[${ANNOTATION_MESSAGE_ID_ATTRIBUTE}]`) ?? null
}
