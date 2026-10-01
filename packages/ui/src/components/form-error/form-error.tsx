import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { errorText } from '../field/field-error.styles'

export type FormErrorProps = Omit<
  ComponentProps<'div'>,
  'className' | 'children' | 'role'
> & {
  className?: string
  /** What failed, in R10's words: "Couldn't save the project." */
  children?: ReactNode
  /** Why, or what to do next, on the line underneath, in the muted ink. */
  detail?: ReactNode
}

/** Nothing to say: no error, so nothing renders. */
const isEmpty = (children: ReactNode): boolean =>
  children === null ||
  children === undefined ||
  children === false ||
  children === ''

/**
 * What went wrong with a whole form, or on the far side, rather than with one
 * field (that's FieldError) (MAR-3616 DS3c). R10: "Couldn't <verb> <thing>."
 * with the reason underneath. It reads as a FieldError does, in the danger
 * ink, and it is an alert, so a screen reader says it at once. Put it above
 * the form's buttons.
 *
 * Pass the error as it is, `<FormError>{error}</FormError>`: without one it
 * renders nothing.
 */
export function FormError({
  className,
  children,
  detail,
  ...props
}: FormErrorProps) {
  if (isEmpty(children)) return null
  return (
    <div
      data-slot="form-error"
      role="alert"
      className={cn('flex min-w-0 flex-col gap-0.5', className)}
      {...props}
    >
      <p className={cn(errorText, 'wrap-anywhere starting:opacity-0')}>
        {children}
      </p>
      {detail ? (
        <p className="text-xs wrap-anywhere text-ink-muted">{detail}</p>
      ) : null}
    </div>
  )
}
