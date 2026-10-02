import { Input as InputPrimitive } from '@base-ui/react/input'
import type { Ref } from 'react'
import { cn } from '#lib/cn.pure'
import {
  controlFrame,
  controlHeight,
  type ControlSize,
} from '#lib/control-frame.styles'
import { focusRingField } from '#lib/focus-ring.styles'

/**
 * The kinds of text an Input takes. A checkbox or a radio is not an Input:
 * those are Checkbox and RadioGroup, so `type="checkbox"` doesn't compile.
 */
export type InputType =
  | 'text'
  | 'search'
  | 'email'
  | 'password'
  | 'number'
  | 'tel'
  | 'url'
  | 'date'
  | 'datetime-local'
  | 'month'
  | 'time'
  | 'week'

export type InputProps = Omit<
  InputPrimitive.Props,
  'className' | 'type' | 'size' | 'ref'
> & {
  className?: string
  type?: InputType
  /** R3: 24, 28, 32 or 36 px. `md` (32) unless said. */
  size?: ControlSize
  /**
   * `field` (the default) wears the field frame and rings over its border.
   * `bare` is a field inside a box of its own, such as a stepper's: no
   * border, fill, shadow or ring of its own, because the box is what reads as
   * the field and rings for it (`focusRingWithin`). Never a className that
   * cancels the ring (DS-7).
   */
  variant?: InputVariant
  ref?: Ref<HTMLInputElement>
}

export type InputVariant = 'field' | 'bare'

/** A bare field's frame: no edge and no ring, the box around it has them. */
const bare = 'border-0 bg-transparent shadow-none outline-none'

/**
 * One line of text (MAR-3616 DS3c), on Base UI's Input: in a Field it gets
 * its label, hint and error wired; on its own it needs a <label> or an
 * aria-label. It wears the field frame (today's look) and rings over its
 * border, unless it is `bare` inside a box that rings for it. Invalid
 * (`aria-invalid`, or its Field's) turns the border red.
 */
export function Input({
  className,
  type,
  size = 'md',
  variant = 'field',
  ref,
  ...props
}: InputProps) {
  return (
    <InputPrimitive
      ref={ref as Ref<HTMLElement>}
      type={type}
      data-slot="input"
      data-size={size}
      data-variant={variant}
      className={cn(
        'flex px-3 py-1',
        controlFrame,
        controlHeight[size],
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink',
        variant === 'bare' ? bare : focusRingField,
        className,
      )}
      {...props}
    />
  )
}
