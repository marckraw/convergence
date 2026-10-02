import { Fieldset as FieldsetPrimitive } from '@base-ui/react/fieldset'
import {
  type ComponentProps,
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import { cn } from '#lib/cn.pure'

/** The id a group's description takes, and how it says it is there. */
const DescriptionContext = createContext<{
  id: string
  setShown: (shown: boolean) => void
} | null>(null)

export type FieldsetProps = Omit<FieldsetPrimitive.Root.Props, 'className'> & {
  className?: string
}

/**
 * Several fields or choices under one name (FieldsetLegend), like a
 * workspace's strategy or a start point (MAR-3616 DS3c). It is a <fieldset>
 * named by its legend; disable it and everything in it is. For a set of
 * radios, render the RadioGroup as it:
 * `<Fieldset render={<RadioGroup … />}>`. A FieldsetDescription in it
 * describes the group (`aria-describedby`), so a screen reader says the hint
 * with the group's name.
 */
export function Fieldset({ className, ...props }: FieldsetProps) {
  const id = useId()
  const [shown, setShown] = useState(false)
  const description = useMemo(() => ({ id, setShown }), [id])
  const describedBy =
    [props['aria-describedby'], shown ? id : null].filter(Boolean).join(' ') ||
    undefined
  return (
    <DescriptionContext.Provider value={description}>
      <FieldsetPrimitive.Root
        data-slot="fieldset"
        className={cn(
          'group/fieldset flex min-w-0 flex-col gap-1.5',
          className,
        )}
        {...props}
        aria-describedby={describedBy}
      />
    </DescriptionContext.Provider>
  )
}

export type FieldsetDescriptionProps = Omit<
  ComponentProps<'p'>,
  'className' | 'id'
> & {
  className?: string
}

/**
 * A hint for the whole group, under its legend, in the look of a field's
 * description: the group is described by it, so it is read with the group's
 * name, not left as loose text a screen reader may never reach (DLG-7).
 */
export function FieldsetDescription({
  className,
  ...props
}: FieldsetDescriptionProps) {
  const description = useContext(DescriptionContext)
  useLayoutEffect(() => {
    if (!description) return
    description.setShown(true)
    return () => description.setShown(false)
  }, [description])
  return (
    <p
      data-slot="fieldset-description"
      id={description?.id}
      className={cn(
        'text-xs text-ink-muted group-data-disabled/fieldset:opacity-50',
        className,
      )}
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
