import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { cn } from '#lib/cn.pure'
import type { ControlSize } from '#lib/control-frame.styles'
import { focusRing } from '#lib/focus-ring.styles'
import { press } from '../../motion/press/press.styles'

export type ToggleVariant = 'button' | 'chip'

export type ToggleProps = Omit<TogglePrimitive.Props, 'className'> & {
  className?: string
  /** R3: 24, 28, 32 or 36 px. `md` (32) unless said. */
  size?: ControlSize
  /**
   * `button`: a toolbar toggle, quiet until pressed (the composer's Fast and
   * Quiet). `chip`: a rounded filter chip with an edge (Mission Control's
   * filters).
   */
  variant?: ToggleVariant
  /**
   * Why it can't be flipped now (R2), as Button's: it stays focusable
   * (aria-disabled), a press changes nothing, the reason is its accessible
   * description, and its tooltip says why (under the label, when a Tooltip
   * already names it). Empty or missing: available, unless `disabled`.
   */
  disabledReason?: string
}

type TooltipData = {
  'data-tooltip'?: string
  'data-tooltip-detail'?: string
}

/** The reason's place in the tooltip, as Button's: the tooltip, or its second line. */
const reasonTooltipOf = (
  tooltip: TooltipData,
  reason: string | undefined,
): TooltipData => {
  if (!reason) return {}
  if (!tooltip['data-tooltip']) return { 'data-tooltip': reason }
  return {
    'data-tooltip-detail': tooltip['data-tooltip-detail']
      ? `${tooltip['data-tooltip-detail']}\n${reason}`
      : reason,
  }
}

const variants: Record<ToggleVariant, string> = {
  button:
    'rounded-md font-medium text-ink-muted not-data-pressed:hover:bg-highlight not-data-pressed:hover:text-on-highlight',
  chip: 'rounded-full border border-hairline font-normal text-ink-muted hover:border-hairline-strong data-pressed:border-hairline-strong',
}

/**
 * R3's one scale. A `button` toggle is a Button's box at every size, so it
 * sits in a toolbar beside Buttons as their equal (MAR-3608: its `sm` had 11
 * px words and Button's 12). A `chip` keeps the filter row's smaller words.
 */
const sizes: Record<ToggleVariant, Record<ControlSize, string>> = {
  button: {
    xs: 'h-control-xs gap-1 px-2 text-2xs',
    sm: 'h-control-sm gap-1.5 px-2 text-xs',
    md: 'h-control-md gap-2 px-3 text-xs',
    lg: 'h-control-lg gap-2 px-4 text-sm',
  },
  chip: {
    xs: 'h-control-xs gap-1 px-2 text-2xs',
    sm: 'h-control-sm gap-1.5 px-2.5 text-2xs',
    md: 'h-control-md gap-2 px-3 text-xs',
    lg: 'h-control-lg gap-2 px-4 text-sm',
  },
}

/**
 * A button that stays pressed: one mode, on or off, like the composer's Fast
 * mode or a filter chip (MAR-3616 DS3c), on Base UI's Toggle. It says
 * `aria-pressed`, where today's toolbar toggles say "switch". R7: pressed is
 * the raised chip (--chip under the raised shadow), the same chosen look as
 * SegmentedControl. Its words are its name; an icon alone needs an
 * aria-label. Unavailable with a reason (`disabledReason`), it stays
 * focusable and says why, as Button does (R2).
 */
export function Toggle({
  className,
  size = 'md',
  variant = 'button',
  disabledReason,
  disabled,
  onClick,
  onPressedChange,
  ...props
}: ToggleProps) {
  const reason = disabledReason || undefined
  return (
    <TogglePrimitive
      data-slot="toggle"
      data-size={size}
      data-variant={variant}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap',
        press,
        variants[variant],
        sizes[variant][size],
        'data-pressed:bg-chip data-pressed:text-ink data-pressed:shadow-raised',
        focusRing,
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        // Unavailable with a reason keeps the pointer, so its tooltip shows (R2).
        'aria-disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        'app-no-drag',
        className,
      )}
      {...props}
      {...reasonTooltipOf(props as TooltipData, reason)}
      aria-description={
        reason ?? (props as { 'aria-description'?: string })['aria-description']
      }
      aria-disabled={reason ? true : props['aria-disabled']}
      disabled={reason ? false : disabled}
      onClick={reason ? undefined : onClick}
      onPressedChange={
        reason ? (_pressed, details) => details.cancel() : onPressedChange
      }
    />
  )
}
