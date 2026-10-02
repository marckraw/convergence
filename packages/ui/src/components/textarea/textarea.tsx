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
  /**
   * `field` (the default) wears the field frame and rings over its border.
   * `bare` is the text inside a card of its own, such as the composer's: no
   * border, padding, shadow, resize handle or ring of its own, because the
   * card is what reads as the field. Never a className that cancels the ring
   * (DS-7).
   */
  variant?: TextareaVariant
}

export type TextareaVariant = 'field' | 'bare'

/** A bare field: the card around it has the edge, the room and the focus. */
const bare = 'min-h-0 resize-none border-0 px-0 py-0 shadow-none outline-none'

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
 * lets it grow; `bare` puts it inside a card that is the field.
 */
export function Textarea({
  className,
  style,
  autoGrow = false,
  maxRows,
  variant = 'field',
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
      data-variant={variant}
      render={<textarea />}
      className={cn(
        'flex min-h-9 px-3 py-2',
        controlFrame,
        autoGrow && 'field-sizing-content',
        variant === 'bare' ? bare : focusRingField,
        className,
      )}
      style={growLimit}
    />
  )
}
