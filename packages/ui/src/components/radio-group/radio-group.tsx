import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import type { ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'
import { tooltipAttributes } from '../tooltip/tooltip'

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

export type RadioSwatchProps<Value> = Omit<
  RadioPrimitive.Root.Props<Value>,
  'className' | 'children' | 'aria-label'
> & {
  className?: string
  /**
   * What the choice is, in a word or two ("Violet", "No emoji"): its
   * accessible name and its tooltip, since a swatch shows no words (R2).
   */
  label: string
  /** The picture: an emoji, a glyph, a colour's mark. Decorative: the label names it. */
  children: ReactNode
}

/**
 * One choice in a RadioGroup shown as a small picture rather than words: an
 * emoji, a colour (MC-19, R9). A 24 px tile in a row of them; the chosen one
 * is R7's raised chip (the chip's fill under the raised shadow, its edge
 * stronger), never a ring, a scale or the focus colour. Put the group's row
 * in the RadioGroup's className (`flex-row flex-wrap`), and give a "none"
 * choice its own swatch, so nothing chosen is a choice too: picking the
 * chosen one again doesn't clear it, as a radio's never does.
 */
export function RadioSwatch<Value>({
  className,
  label,
  children,
  ...props
}: RadioSwatchProps<Value>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-swatch"
      aria-label={label}
      {...tooltipAttributes(label)}
      className={cn(
        'inline-flex size-control-xs shrink-0 items-center justify-center rounded-md border border-transparent text-ink-muted transition-colors',
        'hover:border-hairline-strong',
        'data-checked:border-hairline-strong data-checked:bg-chip data-checked:text-ink data-checked:shadow-raised',
        focusRing,
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        'app-no-drag',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex items-center justify-center leading-none"
      >
        {children}
      </span>
    </RadioPrimitive.Root>
  )
}
