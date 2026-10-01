import { useRender } from '@base-ui/react/use-render'
import { isValidElement, type ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { focusRingInset } from '#lib/focus-ring.styles'
import { MetaLine } from '../meta-line/meta-line'

/**
 * How much a row says, and so how tall it is. `compact` is the sidebar's row
 * string, copied six times today (px-1.5 py-1 text-xs gap-1.5); `dense` is one
 * line at the body size; `default` has room for a meta line under the title.
 */
const DENSITIES = {
  compact: 'gap-1.5 px-1.5 py-1 text-xs',
  dense: 'min-h-8 gap-2 px-2 py-1 text-sm',
  default: 'min-h-12 gap-3 px-2 py-1.5 text-sm',
} as const

type ListRowDensity = keyof typeof DENSITIES

/** A tree row's indent, 12 px a level, up to eight levels. */
const INDENTS = [
  '',
  'w-3',
  'w-6',
  'w-9',
  'w-12',
  'w-15',
  'w-18',
  'w-21',
  'w-24',
]

type ListRowProps = Omit<
  useRender.ComponentProps<'div'>,
  'title' | 'className'
> & {
  className?: string
  density?: ListRowDensity
  /** Its level in a tree, from 0: the row is indented 12 px a level. */
  depth?: number
  /**
   * The chosen row of its list (R7): the selected fill and aria-current. Hover
   * on the other rows is about half as strong, so the two never look alike.
   */
  selected?: boolean
  /** It can't be used now: dimmed, out of reach of the pointer, and disabled for the keyboard. */
  disabled?: boolean
  /** The marker at its start: a 16 px glyph, a dot, an avatar. */
  leading?: ReactNode
  /** What it is: a session's title, a branch's name. One line, cut short. */
  title: ReactNode
  /** Quieter words after the title on its line, cut short with it. */
  aside?: ReactNode
  /** Small marks after the title that keep their place when it's cut: a Badge, "(you)". */
  marks?: ReactNode
  /** What it's numbered by (MAR-3535, #61): the first fact of the meta line. */
  identifier?: ReactNode
  /** The facts under the title, joined by dots (MetaLine): one child each, or a fragment. */
  meta?: ReactNode
  /** Its end, as content: a count, a time, a status. Never a control in a row that opens something. */
  trailing?: ReactNode
  /**
   * Controls of its own, beside it (a ⋯ menu, Archive): hidden until the row
   * is hovered or anything in it has the keyboard's focus, so they are never
   * out of sight of the keyboard (DS-7).
   */
  actions?: ReactNode
}

/**
 * A row in a list (MAR-3616): its marker, its title (with what the title line
 * may add), a meta line under it, and something at its end. Render it as what
 * it does with `render`: a `<button type="button">` or a link (a router Link
 * too) answers the pointer and the keyboard as a row, with its focus ring
 * inside its edge, where a scrolling list can't cut it off; without `render`
 * it's a static row that answers nothing. Props other than its own go to that
 * element; `className` goes to the row around it, which also holds `actions`.
 */
function ListRow({
  density = 'default',
  depth = 0,
  selected = false,
  disabled = false,
  leading,
  title,
  aside,
  marks,
  identifier,
  meta,
  trailing,
  actions,
  render,
  className,
  ...props
}: ListRowProps) {
  const pressable = render !== undefined
  const hasMeta = identifier != null || meta != null
  // A button is disabled for real; anything else (a link, a static row) says so.
  const isButton = isValidElement(render) && render.type === 'button'
  const element = useRender({
    defaultTagName: 'div',
    render,
    props: {
      ...props,
      ...(disabled
        ? isButton
          ? { disabled: true }
          : { 'aria-disabled': true }
        : {}),
      'data-slot': 'list-row-target',
      'aria-current': selected ? 'true' : undefined,
      className: cn(
        'flex min-w-0 flex-1 items-center rounded text-left',
        DENSITIES[density],
        pressable && ['app-no-drag', focusRingInset],
      ),
      children: (
        <>
          {leading == null ? null : (
            <span
              data-slot="list-row-leading"
              className={cn(
                'flex min-w-4 shrink-0 items-center justify-center text-ink-muted',
                density === 'compact' ? '[&>svg]:size-3.5' : '[&>svg]:size-4',
              )}
            >
              {leading}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              data-slot="list-row-title"
              className="flex min-w-0 items-center gap-1.5"
            >
              <span className="min-w-0 truncate">
                <span className={cn(density === 'default' && 'font-medium')}>
                  {title}
                </span>
                {aside == null ? null : (
                  <>
                    {' '}
                    <span className="text-ink-muted">{aside}</span>
                  </>
                )}
              </span>
              {marks == null ? null : (
                <span className="flex shrink-0 items-center gap-1.5">
                  {marks}
                </span>
              )}
            </span>
            {hasMeta ? (
              <MetaLine
                data-slot="list-row-meta"
                className={cn(
                  'text-ink-muted tabular-nums',
                  density === 'compact' ? 'text-2xs' : 'text-xs',
                )}
              >
                {identifier}
                {meta}
              </MetaLine>
            ) : null}
          </span>
          {trailing == null ? null : (
            <span
              data-slot="list-row-trailing"
              className="flex shrink-0 items-center gap-2 text-xs text-ink-muted tabular-nums"
            >
              {trailing}
            </span>
          )}
        </>
      ),
    },
  })
  return (
    <div
      data-slot="list-row"
      data-density={density}
      data-depth={depth}
      data-selected={selected ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      className={cn(
        'group/list-row relative flex w-full min-w-0 items-center rounded text-ink transition-colors',
        selected && 'bg-fill-selected',
        pressable && !selected && !disabled && 'hover:bg-fill-hover',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {depth > 0 ? (
        <span
          aria-hidden
          className={cn('shrink-0', INDENTS[Math.min(depth, 8)])}
        />
      ) : null}
      {element}
      {actions == null ? null : (
        <span
          data-slot="list-row-actions"
          className="app-no-drag flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-focus-within/list-row:opacity-100 group-hover/list-row:opacity-100"
        >
          {actions}
        </span>
      )}
    </div>
  )
}

export { ListRow, type ListRowDensity, type ListRowProps }
