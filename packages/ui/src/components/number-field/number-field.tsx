import { NumberField as NumberFieldPrimitive } from '@base-ui/react/number-field'
import { MinusIcon, PlusIcon } from 'lucide-react'
import type { FocusEventHandler, MouseEvent } from 'react'
import { cn } from '#lib/cn.pure'
import {
  controlFrameLook,
  controlHeight,
  type ControlSize,
} from '#lib/control-frame.styles'
import { focusRingWithin } from '#lib/focus-ring.styles'
import { IconButton } from '../icon-button/icon-button'

export type NumberFieldProps = Omit<
  NumberFieldPrimitive.Root.Props,
  'className' | 'render'
> & {
  className?: string
  /** R3: 24, 28, 32 or 36 px. `md` (32) unless told otherwise. */
  size?: ControlSize
  /** What the − button does, in words: its name and its tooltip (R2). */
  decrementLabel?: string
  /** What the + button does, in words: its name and its tooltip (R2). */
  incrementLabel?: string
  /**
   * The steps alone are unavailable, as while a step is being saved, and the
   * field still takes typing. `disabled` turns off the whole field.
   */
  stepsDisabled?: boolean
  /** The field's name when no Field labels it. */
  'aria-label'?: string
  /** The field is wrong; in a Field, its `invalid` says so instead. */
  'aria-invalid'?: boolean
  /** What else describes the field: a refusal drawn under it. */
  'aria-describedby'?: string
  placeholder?: string
  /** The focus left the field: where a typed value is saved. */
  onBlur?: FocusEventHandler<HTMLInputElement>
}

/**
 * A press on − or + leaves the focus where it was: in the field, which a
 * blur would save mid-typing, before the step saved again (MAR-3118 C1).
 */
const keepFocus = (event: MouseEvent) => event.preventDefault()

/** Each step button's size inside the frame: one step down the scale. */
const STEP_SIZE: Record<ControlSize, ControlSize> = {
  xs: 'xs',
  sm: 'xs',
  md: 'sm',
  lg: 'md',
}

/**
 * A whole number with − and + beside it (MC-4), on Base UI's NumberField:
 * the WIP limit a seat may hold, how many to run at once. It wears the field
 * frame, and the ring goes round the whole box while its field has the focus
 * (the field is what the keyboard reaches; the arrows step it, as do the
 * buttons under the pointer). The buttons are IconButtons, named by what they
 * change; at `min` or `max` the one that would pass it is unavailable.
 * Invalid (`aria-invalid`, or its Field's) turns the border red. In a Field,
 * the label names the field and the description and error describe it.
 */
export function NumberField({
  className,
  size = 'md',
  decrementLabel = 'Decrease',
  incrementLabel = 'Increase',
  stepsDisabled,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  placeholder,
  onBlur,
  ...props
}: NumberFieldProps) {
  const step = STEP_SIZE[size]
  return (
    <NumberFieldPrimitive.Root
      data-slot="number-field"
      className={cn('inline-flex', className)}
      {...props}
    >
      <NumberFieldPrimitive.Group
        data-slot="number-field-group"
        data-size={size}
        className={cn(
          'flex items-center',
          controlFrameLook,
          controlHeight[size],
          'has-aria-invalid:border-danger-solid',
          focusRingWithin,
        )}
      >
        <NumberFieldPrimitive.Decrement
          disabled={stepsDisabled}
          render={
            <IconButton
              label={decrementLabel}
              variant="quiet"
              size={step}
              onMouseDown={keepFocus}
            />
          }
        >
          <MinusIcon aria-hidden className="size-3" />
        </NumberFieldPrimitive.Decrement>
        <NumberFieldPrimitive.Input
          data-slot="number-field-input"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          placeholder={placeholder}
          onBlur={onBlur}
          className="h-full w-9 min-w-0 bg-transparent text-center text-xs tabular-nums outline-none placeholder:text-ink-muted"
        />
        <NumberFieldPrimitive.Increment
          disabled={stepsDisabled}
          render={
            <IconButton
              label={incrementLabel}
              variant="quiet"
              size={step}
              onMouseDown={keepFocus}
            />
          }
        >
          <PlusIcon aria-hidden className="size-3" />
        </NumberFieldPrimitive.Increment>
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  )
}
