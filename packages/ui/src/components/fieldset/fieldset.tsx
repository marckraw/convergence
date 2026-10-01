import { Fieldset as FieldsetPrimitive } from '@base-ui/react/fieldset'
import { cn } from '#lib/cn.pure'

export type FieldsetProps = Omit<FieldsetPrimitive.Root.Props, 'className'> & {
  className?: string
}

/**
 * Several fields or choices under one name (FieldsetLegend), like a
 * workspace's strategy or a start point (MAR-3616 DS3c). It is a <fieldset>
 * named by its legend; disable it and everything in it is. For a set of
 * radios, render the RadioGroup as it:
 * `<Fieldset render={<RadioGroup … />}>`.
 */
export function Fieldset({ className, ...props }: FieldsetProps) {
  return (
    <FieldsetPrimitive.Root
      data-slot="fieldset"
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
      {...props}
    />
  )
}

export type FieldsetLegendProps = Omit<
  FieldsetPrimitive.Legend.Props,
  'className'
> & {
  className?: string
}

/** The group's name, first in it, in the look of a field's label. */
export function FieldsetLegend({ className, ...props }: FieldsetLegendProps) {
  return (
    <FieldsetPrimitive.Legend
      data-slot="fieldset-legend"
      className={cn(
        'select-none text-sm font-medium data-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
