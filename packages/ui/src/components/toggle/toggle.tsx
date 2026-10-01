import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { cn } from '#lib/cn.pure'
import type { ControlSize } from '#lib/control-frame.styles'
import { focusRing } from '#lib/focus-ring.styles'
import { press } from '../../motion/press/press.styles'

export type ToggleVariant = 'button' | 'chip'

export type ToggleProps = Omit<TogglePrimitive.Props, 'className'> & {
  className?: string
  /** R3: 24, 28, 32 or 36 px. `sm` (28) unless said, a toolbar's height. */
  size?: ControlSize
  /**
   * `button`: a toolbar toggle, quiet until pressed (the composer's Fast and
   * Quiet). `chip`: a rounded filter chip with an edge (Mission Control's
   * filters).
   */
  variant?: ToggleVariant
}

const variants: Record<ToggleVariant, string> = {
  button:
    'rounded-md font-medium text-ink-muted not-data-pressed:hover:bg-highlight not-data-pressed:hover:text-on-highlight',
  chip: 'rounded-full border border-hairline font-normal text-ink-muted hover:border-hairline-strong data-pressed:border-hairline-strong',
}

const sizes: Record<ControlSize, string> = {
  xs: 'h-control-xs gap-1 px-2 text-2xs',
  sm: 'h-control-sm gap-1.5 px-2.5 text-2xs',
  md: 'h-control-md gap-2 px-3 text-xs',
  lg: 'h-control-lg gap-2 px-4 text-sm',
}

/**
 * A button that stays pressed: one mode, on or off, like the composer's Fast
 * mode or a filter chip (MAR-3616 DS3c), on Base UI's Toggle. It says
 * `aria-pressed`, where today's toolbar toggles say "switch". R7: pressed is
 * the raised chip (--chip under the raised shadow), the same chosen look as
 * SegmentedControl. Its words are its name; an icon alone needs an
 * aria-label.
 */
export function Toggle({
  className,
  size = 'sm',
  variant = 'button',
  ...props
}: ToggleProps) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      data-size={size}
      data-variant={variant}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap',
        press,
        variants[variant],
        sizes[size],
        'data-pressed:bg-chip data-pressed:text-ink data-pressed:shadow-raised',
        focusRing,
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        'app-no-drag',
        className,
      )}
      {...props}
    />
  )
}
