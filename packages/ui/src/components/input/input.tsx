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
  ref?: Ref<HTMLInputElement>
}

/**
 * One line of text (MAR-3616 DS3c), on Base UI's Input: in a Field it gets
 * its label, hint and error wired; on its own it needs a <label> or an
 * aria-label. It wears the field frame (today's look) and rings over its
 * border. Invalid (`aria-invalid`, or its Field's) turns the border red.
 */
export function Input({
  className,
  type,
  size = 'md',
  ref,
  ...props
}: InputProps) {
  return (
    <InputPrimitive
      ref={ref as Ref<HTMLElement>}
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        'flex px-3 py-1',
        controlFrame,
        controlHeight[size],
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink',
        focusRingField,
        className,
      )}
      {...props}
    />
  )
}
