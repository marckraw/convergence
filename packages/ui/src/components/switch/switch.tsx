import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'

export type SwitchProps = Omit<SwitchPrimitive.Root.Props, 'className'> & {
  className?: string
}

/**
 * One setting that is on or off and takes effect at once (MAR-3616 DS3c), on
 * Base UI's Switch. Today's track and thumb (R0): 36 × 20, filled with the
 * strong colour when on; off, its edge is the control line (MAR-3460), where
 * it was a faint hairline. It gains the keyboard's focus ring it lacked.
 * Give it its words with a ChoiceField (the switch sits at the row's end), or
 * an aria-label. Space toggles it. It is a <button role="switch">, as
 * SwitchRow's was. Under reduced motion the thumb jumps.
 */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      nativeButton
      render={<button type="button" />}
      className={cn(
        'relative inline-block h-5 w-9 shrink-0 rounded-full border transition-colors',
        'border-control-line bg-surface-muted',
        'data-checked:border-strong data-checked:bg-strong',
        focusRing,
        'aria-invalid:border-danger-solid data-invalid:border-danger-solid',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        'after:absolute after:-inset-1',
        'app-no-drag',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none absolute top-0.5 left-0.5 block size-4 rounded-full bg-canvas shadow-control',
          'motion-safe:transition-transform data-checked:translate-x-4',
        )}
      />
    </SwitchPrimitive.Root>
  )
}
