import {
  Children,
  type ComponentProps,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cn } from '#lib/cn.pure'

/**
 * The facts in children, one by one: a fragment's children count each, so a
 * caller can hand its facts over as one `<>…</>`. Nothing, false and "" aren't
 * facts, so a missing one never leaves two dots side by side.
 */
const factsOf = (children: ReactNode): ReactNode[] =>
  Children.toArray(children).flatMap((child) => {
    if (isValidElement(child) && child.type === Fragment) {
      return factsOf(
        (child as ReactElement<{ children?: ReactNode }>).props.children,
      )
    }
    return child === '' ? [] : [child]
  })

type MetaLineProps = Omit<ComponentProps<'span'>, 'className'> & {
  className?: string
  /**
   * The facts wrap onto more lines instead of ending in an ellipsis: for facts
   * that must be read whole, a path, a reason. A wrapped line never starts
   * with a dot: each dot holds on to the fact before it.
   */
  wrap?: boolean
}

/**
 * Facts about something on one quiet line (MAR-3616): "convergence · main ·
 * 4 min ago". Each child is a fact, joined to the next by one "·" with a
 * space either side, the same gap everywhere, so no surface writes a hyphen
 * or a bare gap instead (CONV-23). The dot is hidden from screen readers,
 * which hear a comma's pause.
 *
 * It is one line of text, so a line too long for its room ends in an
 * ellipsis, unless it may `wrap`. It takes its size and colour from where it
 * is used. It is `relative`, so the screen readers' commas past the ellipsis
 * (sr-only, placed absolutely) are cut off with the words.
 */
function MetaLine({
  className,
  children,
  wrap = false,
  ...props
}: MetaLineProps) {
  const line: ReactNode[] = []
  for (const [position, fact] of factsOf(children).entries()) {
    line.push(
      <Fragment key={position}>
        {position > 0 ? (
          <>
            {/* Wrapping, a no-break space ties the dot to the fact before it. */}
            <span className="sr-only">,</span>
            {wrap ? '\u00a0' : ' '}
            <span aria-hidden="true">·</span>{' '}
          </>
        ) : null}
        {fact}
      </Fragment>,
    )
  }
  return (
    <span
      data-slot="meta-line"
      data-wrap={wrap ? '' : undefined}
      className={cn(
        'relative block min-w-0',
        wrap ? 'wrap-anywhere' : 'truncate',
        className,
      )}
      {...props}
    >
      {line}
    </span>
  )
}

export { MetaLine, type MetaLineProps }
