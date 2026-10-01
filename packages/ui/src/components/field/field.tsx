import { Field as FieldPrimitive } from '@base-ui/react/field'
import { cn } from '#lib/cn.pure'
import { errorText } from './field-error.styles'

/*
 * The field family (MAR-3616 DS3c), on Base UI's Field: the label, the hint
 * and the error are tied to the control for screen readers without passing
 * ids around, and an invalid field marks its control `aria-invalid`.
 */

export type FieldProps = Omit<FieldPrimitive.Root.Props, 'className'> & {
  className?: string
}

/**
 * One control with its label, its hint and its error, stacked. Disable it
 * here and the label, the hint and the control dim together; mark it
 * `invalid` and the control says so.
 */
export function Field({ className, ...props }: FieldProps) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn('flex w-full flex-col gap-1.5', className)}
      {...props}
    />
  )
}

export type FieldLabelVariant = 'default' | 'caption'

export type FieldLabelProps = Omit<FieldPrimitive.Label.Props, 'className'> & {
  className?: string
  /**
   * `default` is the form label (`text-sm font-medium`, today's most common).
   * `caption` is a dense panel's label: 11 px, medium, muted, as Mission
   * Control's inspectors draw it.
   */
  variant?: FieldLabelVariant
}

const labelVariants: Record<FieldLabelVariant, string> = {
  default: 'text-sm font-medium',
  caption: 'text-2xs font-medium text-ink-muted',
}

/** The control's name, always visible; pressing it focuses the control. */
export function FieldLabel({
  className,
  variant = 'default',
  ...props
}: FieldLabelProps) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      data-variant={variant}
      className={cn(
        'w-fit select-none data-disabled:opacity-50',
        labelVariants[variant],
        className,
      )}
      {...props}
    />
  )
}

export type FieldDescriptionProps = Omit<
  FieldPrimitive.Description.Props,
  'className'
> & {
  className?: string
}

/** A hint under the control, read out with it as its description. */
export function FieldDescription({
  className,
  ...props
}: FieldDescriptionProps) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn(
        'text-xs text-ink-muted data-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export type FieldErrorProps = Omit<FieldPrimitive.Error.Props, 'className'> & {
  className?: string
  /**
   * Keep a line's room while there is no error, so one that appears pushes
   * nothing down. On by default; turn it off where nothing follows the field.
   */
  reserve?: boolean
}

/**
 * What's wrong with the control, in words (R10). It shows when the field is
 * invalid and `match` says so (`match` alone shows it always), fades in and
 * out, and is an alert, so a screen reader says it at once. The control is
 * described by it. An error about the whole form is a FormError.
 */
export function FieldError({
  className,
  reserve = true,
  ...props
}: FieldErrorProps) {
  const error = (
    <FieldPrimitive.Error
      data-slot="field-error"
      role="alert"
      className={cn(
        errorText,
        'data-ending-style:opacity-0 data-starting-style:opacity-0',
        className,
      )}
      {...props}
    />
  )
  // Base UI renders nothing without an error: the room is a box around it.
  return reserve ? (
    <div data-slot="field-error-room" className="min-h-4">
      {error}
    </div>
  ) : (
    error
  )
}
