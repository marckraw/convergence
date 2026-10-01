import { Field as FieldPrimitive } from '@base-ui/react/field'
import type { ComponentProps } from 'react'
import { cn } from '#lib/cn.pure'
import { controlFrame } from '#lib/control-frame.styles'
import { focusRingField } from '#lib/focus-ring.styles'

export type TextareaProps = Omit<ComponentProps<'textarea'>, 'className'> & {
  className?: string
  /**
   * Grow with what's typed, from `rows` up to `maxRows`, then scroll. CSS
   * (`field-sizing: content`), so nothing measures in script.
   */
  autoGrow?: boolean
  /** With `autoGrow`: the most lines it grows to before it scrolls. */
  maxRows?: number
}

/**
 * Base UI types its field control as an <input>; drawn as a <textarea>, it
 * takes a textarea's props, events and ref, which it hands to the element.
 */
type ControlProps = Omit<FieldPrimitive.Control.Props, 'render'>

/**
 * A few lines of plain text (MAR-3616 DS3c): Base UI's field control drawn
 * as a <textarea>, so in a Field it gets its label, hint and error wired like
 * Input; on its own it needs a <label> or an aria-label. It wears the field
 * frame, with its border on the control line (MAR-3460) instead of today's
 * faint hairline, and the app's scrollbar. `rows` sets its height; `autoGrow`
 * lets it grow.
 */
export function Textarea({
  className,
  style,
  autoGrow = false,
  maxRows,
  ...props
}: TextareaProps) {
  // py-2 and the 1 px border: what a line count adds to make a height.
  const growLimit =
    autoGrow && maxRows !== undefined
      ? { maxHeight: `calc(${maxRows}lh + 1rem + 2px)`, ...style }
      : style
  return (
    <FieldPrimitive.Control
      {...(props as unknown as ControlProps)}
      data-slot="textarea"
      data-auto-grow={autoGrow ? '' : undefined}
      render={<textarea />}
      className={cn(
        'app-scrollbar flex min-h-9 px-3 py-2',
        controlFrame,
        autoGrow && 'field-sizing-content',
        focusRingField,
        className,
      )}
      style={growLimit}
    />
  )
}
