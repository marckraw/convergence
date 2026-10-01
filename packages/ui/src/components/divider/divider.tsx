import { type ComponentProps, type ReactNode, useId } from 'react'
import { cn } from '#lib/cn.pure'

type DividerProps = Omit<
  ComponentProps<'div'>,
  'className' | 'children' | 'role'
> & {
  className?: string
  /** Words in the rule's middle, which also name it: "Compacted", "Turn 3". */
  label?: ReactNode
  /** horizontal (the default) runs across; vertical runs down, between items on a row. */
  orientation?: 'horizontal' | 'vertical'
}

/**
 * A line between two things (MAR-3616), in the quiet border colour. With a
 * `label` it is the transcript's boundary marker: rule, words, rule, in the
 * 12 px muted print, as the compaction marker draws it today (CONV-13). It is
 * a separator; a label names it, so a screen reader says what the boundary
 * is.
 */
function Divider({
  label,
  orientation = 'horizontal',
  className,
  ...props
}: DividerProps) {
  const labelId = useId()
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        data-slot="divider"
        className={cn('w-px shrink-0 self-stretch bg-line', className)}
        {...props}
      />
    )
  }
  if (label == null) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        data-slot="divider"
        className={cn('h-px w-full shrink-0 bg-line', className)}
        {...props}
      />
    )
  }
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-labelledby={labelId}
      data-slot="divider"
      className={cn(
        'flex w-full items-center gap-2 text-xs text-ink-muted',
        className,
      )}
      {...props}
    >
      <span aria-hidden className="h-px min-w-4 flex-1 bg-line" />
      <span id={labelId} className="min-w-0 shrink text-center wrap-anywhere">
        {label}
      </span>
      <span aria-hidden className="h-px min-w-4 flex-1 bg-line" />
    </div>
  )
}

export { Divider, type DividerProps }
