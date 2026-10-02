import { Field as FieldPrimitive } from '@base-ui/react/field'
import type { ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { textStack } from '#lib/text-stack.styles'
import { FieldDescription, FieldLabel } from '../field/field'

export type ChoiceFieldProps = Omit<
  FieldPrimitive.Root.Props,
  'className' | 'children'
> & {
  className?: string
  /** The control: a Switch, a Checkbox, or a RadioGroupItem in its group. */
  children: ReactNode
  /** Its words, which name it. Pressing them toggles it. */
  label: ReactNode
  /** A line under the words, read out with the control as its description. */
  hint?: ReactNode
}

/**
 * A switch, a checkbox or a radio with its words, and a hint under them if
 * it needs one (MAR-3616 DS3c). It replaces SwitchRow and keeps its look
 * (R0): words at 14 px beside the control, the hint at 12 px in the muted
 * ink, `py-1`. A switch sits at the row's end, centred on the words, as
 * settings have it; a checkbox or a radio goes before them, on the first
 * line. The words name the control and the hint describes it (Base UI's
 * Field), so a screen reader says both. Disable it here, not on the control,
 * so its words dim with it.
 */
export function ChoiceField({
  children,
  label,
  hint,
  className,
  ...props
}: ChoiceFieldProps) {
  return (
    <FieldPrimitive.Root
      data-slot="choice-field"
      className={cn(
        'flex items-center gap-4 py-1',
        'has-data-[slot=checkbox]:items-start has-data-[slot=checkbox]:gap-2',
        'has-data-[slot=radio-group-item]:items-start has-data-[slot=radio-group-item]:gap-2',
        className,
      )}
      {...props}
    >
      {/* At least the words' first line tall, so a small control sits on it. */}
      <div className="flex min-h-lh shrink-0 items-center text-sm leading-tight has-data-[slot=switch]:order-last">
        {children}
      </div>
      <div className={textStack}>
        <FieldLabel className="w-full text-sm leading-tight font-normal">
          {label}
        </FieldLabel>
        {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      </div>
    </FieldPrimitive.Root>
  )
}
