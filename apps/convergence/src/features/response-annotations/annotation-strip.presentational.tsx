import type { FC, KeyboardEvent, ReactNode } from 'react'
import type { ResponseAnnotation } from '@/entities/response-annotation'
import { Button } from '@/shared/ui/button'
import {
  formatAnnotationCount,
  stripNavigationTarget,
  toPillBody,
  toPillQuote,
} from './annotation-strip.pure'

/**
 * The RESPONDING TO strip (MAR-3004): every pending annotation as one compact
 * pill in a single row that scrolls sideways instead of wrapping.
 *
 * Fourteen full-width chips used to stack a screen tall and push the
 * transcript out of view. The row never wraps, so however many annotations
 * are waiting the composer keeps its height; exactly one pill at a time opens
 * into today's full chip to be read, edited or removed.
 *
 * Render-only. Which pill is open, which holds the Tab stop and where focus
 * goes next live in the container; this component only says what each state
 * looks like and where the arrow keys point.
 */

interface AnnotationStripProps {
  annotations: readonly ResponseAnnotation[]
  expandedId: string | null
  /** The one pill Tab reaches; every other pill is reached by the arrows. */
  tabStopId: string | null
  onExpand: (annotationId: string) => void
  onCollapse: () => void
  onPillFocus: (annotationId: string) => void
  /** Today's full chip, for the one annotation that is open. */
  renderExpanded: (annotation: ResponseAnnotation) => ReactNode
}

function isTextField(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

/**
 * Arrow keys walk the row. Focus goes to the item's first control, which is
 * the pill itself or, for the open item, its first button — so the row reads
 * as one toolbar whichever item is expanded. A press that began in a text
 * field or carries a modifier is never the row's (see stripNavigationTarget).
 */
function moveFocusAlongStrip(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  length: number,
): void {
  const next = stripNavigationTarget(
    index,
    {
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      fromTextField: isTextField(event.target),
    },
    length,
  )
  if (next === null) return
  event.preventDefault()
  const items = event.currentTarget
    .closest('[role="list"]')
    ?.querySelectorAll<HTMLElement>(':scope > li')
  items?.[next]?.querySelector<HTMLElement>('button')?.focus()
}

export const AnnotationStrip: FC<AnnotationStripProps> = ({
  annotations,
  expandedId,
  tabStopId,
  onExpand,
  onCollapse,
  onPillFocus,
  renderExpanded,
}) => (
  <div
    className="mx-auto mb-2 flex w-full max-w-2xl items-center gap-2"
    data-testid="annotation-tray"
  >
    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
      Responding to
    </span>
    {/* Live, so a removal is announced as the number it leaves behind. */}
    <span
      aria-live="polite"
      className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
    >
      {formatAnnotationCount(annotations.length)}
    </span>
    {/* The side padding matches the fade, so no pill sits under it at rest
        and a focused pill scrolls clear of it; the vertical padding leaves
        room for the focus ring, which the scroll container would clip. */}
    <ul
      role="list"
      aria-label="Responding to"
      className="flex min-w-0 flex-1 scroll-px-3 flex-nowrap items-center gap-1.5 overflow-x-auto px-3 py-1 [mask-image:linear-gradient(to_right,transparent,black_0.75rem,black_calc(100%-0.75rem),transparent)]"
    >
      {annotations.map((annotation, index) => (
        <li key={annotation.id} className="shrink-0">
          {annotation.id === expandedId ? (
            <div
              data-annotation-expanded={annotation.id}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  onCollapse()
                  return
                }
                moveFocusAlongStrip(event, index, annotations.length)
              }}
            >
              {renderExpanded(annotation)}
            </div>
          ) : (
            // Named by what it shows — the quote and the response — so a 👍
            // and a comment on the same words are two different buttons to a
            // screen reader, as they are to the eye.
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-annotation-pill=""
              data-annotation-id={annotation.id}
              tabIndex={annotation.id === tabStopId ? 0 : -1}
              onClick={() => onExpand(annotation.id)}
              onFocus={() => onPillFocus(annotation.id)}
              onKeyDown={(event) =>
                moveFocusAlongStrip(event, index, annotations.length)
              }
              className="h-auto max-w-[14rem] justify-start gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-normal text-foreground hover:bg-primary/15 focus-visible:ring-2"
            >
              <span className="min-w-0 truncate italic text-muted-foreground">
                {toPillQuote(annotation.quotedText)}
              </span>{' '}
              <span
                aria-hidden="true"
                className="shrink-0 text-muted-foreground"
              >
                →
              </span>{' '}
              <span className="min-w-0 truncate">
                {toPillBody(annotation.body)}
              </span>
            </Button>
          )}
        </li>
      ))}
    </ul>
  </div>
)
