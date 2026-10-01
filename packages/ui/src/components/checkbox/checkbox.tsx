import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { CheckIcon, MinusIcon } from 'lucide-react'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'

export type CheckboxProps = Omit<CheckboxPrimitive.Root.Props, 'className'> & {
  className?: string
}

/**
 * One of several choices that can all be on, like the conversations to
 * merge or the models to show (MAR-3616 DS3c), on Base UI's Checkbox. One
 * look everywhere, where the app drew five OS checkboxes: a 16 px box on the
 * control line, filled with the strong colour when on. Give it its words with
 * a ChoiceField, or wrap it and its text in a <label>; Space toggles it, and
 * its hit area reaches a little past the box. It is a <button role="checkbox">
 * (so it is `disabled` as a button is, and its own aria-label outranks a
 * label around it, as an input's does), not an <input>: read
 * `onCheckedChange`, there's no `event.target.checked`.
 */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      nativeButton
      render={<button type="button" />}
      className={cn(
        'relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-control-line',
        'bg-transparent text-on-strong transition-colors',
        'data-checked:border-strong data-checked:bg-strong',
        'data-indeterminate:border-strong data-indeterminate:bg-strong',
        focusRing,
        'aria-invalid:border-danger-solid data-invalid:border-danger-solid',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        'after:absolute after:-inset-2',
        'app-no-drag',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current [&>svg]:size-3"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {state.indeterminate ? (
              <MinusIcon aria-hidden strokeWidth={3} />
            ) : (
              <CheckIcon aria-hidden strokeWidth={3} />
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  )
}
