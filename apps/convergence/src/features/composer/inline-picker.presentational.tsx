import type { FC, ReactNode } from 'react'
import { cn, EmptyState, popupSurface } from '@convergence/ui'

/**
 * The composer's inline pickers (`@`, `::`, `::skill::`, `::prompt::`) are
 * one shape (CONV-6, MAR-3617): a popup over the field, an optional heading,
 * and what it lists (a Listbox the field drives, or why there is nothing to
 * list). Drawn once here; each picker brings its rows.
 *
 * The field keeps the focus, so Escape in the field closes it. It had a
 * hidden Close too, which the keyboard reached and saw nothing (DS-7, ruling
 * 5), and which, 32 px tall inside a 1 px box, left the popup 27 px to scroll
 * with nothing in them; it is gone.
 */
export const InlinePicker: FC<{
  testId: string
  /** Its heading: a glyph, a name and a line under it. None for `@` and `::`. */
  heading?: { icon: ReactNode; title: string; detail: string }
  /** max-h-64 for the short pickers, max-h-72 for the ones with a heading. */
  tall?: boolean
  children: ReactNode
}> = ({ testId, heading, tall = false, children }) => (
  <div
    className={cn(
      'absolute right-0 bottom-full left-0 z-50 mb-2 overflow-y-auto p-1',
      popupSurface,
      tall ? 'max-h-72' : 'max-h-64',
    )}
    data-testid={testId}
  >
    {heading ? (
      <div className="border-b border-line-soft px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <span aria-hidden className="flex text-ink-muted [&_svg]:size-3.5">
            {heading.icon}
          </span>
          <span>{heading.title}</span>
        </div>
        <div className="truncate text-2xs text-ink-muted">{heading.detail}</div>
      </div>
    ) : null}
    {children}
  </div>
)

/**
 * Why an inline picker lists nothing: it is loading, it couldn't load, or
 * nothing matches. R10's words: "Loading skills…", "Couldn't load skills",
 * "No matching skills".
 */
export const InlinePickerState: FC<
  | { state: 'loading'; title: string }
  | { state: 'failed'; title: string; detail: string }
  | { state: 'empty'; title: string }
> = (props) =>
  props.state === 'failed' ? (
    <EmptyState
      state="failed"
      variant="plain"
      size="compact"
      title={props.title}
      detail={props.detail}
    />
  ) : props.state === 'loading' ? (
    <EmptyState
      state="loading"
      variant="plain"
      size="compact"
      title={props.title}
    />
  ) : (
    <EmptyState variant="plain" size="compact" title={props.title} />
  )
