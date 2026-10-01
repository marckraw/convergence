import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { useId, type ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'

export type ChoiceCardProps<Value> = Omit<
  RadioPrimitive.Root.Props<Value>,
  'className' | 'children' | 'title'
> & {
  className?: string
  /** The option's name. */
  title: ReactNode
  /** The sentence that says what choosing it does, read out as its description. */
  description?: ReactNode
  /** A glyph before the words. */
  icon?: ReactNode
}

/**
 * One option of a few that each need a sentence, drawn as a card (MAR-3616
 * DS3c, R9), like a fork's strategy or a project's start point. It is a
 * radio: put the cards in a RadioGroup (named by a Fieldset's legend or an
 * aria-label); the arrow keys move the choice. R7: the chosen card is raised
 * (the popup surface under the raised shadow) with a stronger edge; never
 * the ring's colour. It is the raised surface rather than the chip's lighter
 * fill so its muted sentence keeps 4.5:1 in dark. It shares Card's corner
 * and edge.
 */
export function ChoiceCard<Value>({
  className,
  title,
  description,
  icon,
  ...props
}: ChoiceCardProps<Value>) {
  const titleId = useId()
  const descriptionId = useId()
  return (
    <RadioPrimitive.Root
      data-slot="choice-card"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        'relative flex w-full min-w-0 items-start gap-3 rounded-lg border border-line-soft p-3 text-left transition-colors',
        'hover:bg-fill-hover',
        'data-checked:border-control-line data-checked:bg-raised data-checked:shadow-raised data-checked:hover:bg-raised',
        focusRing,
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        'app-no-drag',
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center text-ink-muted [&_svg]:size-4"
        >
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={titleId} className="text-sm font-medium text-ink">
          {title}
        </span>
        {description ? (
          <span id={descriptionId} className="text-xs text-ink-muted">
            {description}
          </span>
        ) : null}
      </span>
    </RadioPrimitive.Root>
  )
}
