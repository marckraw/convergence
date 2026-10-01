import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'

export type RadioGroupProps<Value> = Omit<
  RadioGroupPrimitive.Props<Value>,
  'className'
> & {
  className?: string
}

/**
 * One choice of a few, all in view, each with words of its own (MAR-3616
 * DS3c), on Base UI's RadioGroup. R9: two to four short words side by side
 * are a SegmentedControl; options that each need a sentence are ChoiceCards;
 * five or more are a Select. Name it with a Fieldset's legend
 * (`<Fieldset render={<RadioGroup … />}>`) or an aria-label; the arrow keys
 * move the choice, and Tab leaves the group from the chosen one.
 */
export function RadioGroup<Value>({
  className,
  ...props
}: RadioGroupProps<Value>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn('flex flex-col gap-1', className)}
      {...props}
    />
  )
}

export type RadioGroupItemProps<Value> = Omit<
  RadioPrimitive.Root.Props<Value>,
  'className'
> & {
  className?: string
}

/**
 * One choice in a RadioGroup: a 16 px circle on the control line, like
 * Checkbox, with a strong dot when chosen. Give it its words in a
 * ChoiceField. Its hit area reaches a little past the circle.
 */
export function RadioGroupItem<Value>({
  className,
  ...props
}: RadioGroupItemProps<Value>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        'relative flex size-4 shrink-0 items-center justify-center rounded-full border border-control-line',
        'bg-transparent transition-colors data-checked:border-strong',
        focusRing,
        'aria-invalid:border-danger-solid data-invalid:border-danger-solid',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        'after:absolute after:-inset-2',
        'app-no-drag',
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="size-2 rounded-full bg-strong"
      />
    </RadioPrimitive.Root>
  )
}
