import { ButtonBase, type ButtonProps } from '../button/button'
import { type TooltipSide, tooltipAttributes } from '../tooltip/tooltip'

type IconButtonProps = Omit<ButtonProps, 'aria-label' | 'pendingLabel'> & {
  /**
   * What it does, in a word or two: its accessible name and its tooltip, from
   * one string (R2). Never a native `title`.
   */
  label: string
  /** Where the tooltip shows; above unless told otherwise or that doesn't fit. */
  tooltipSide?: TooltipSide
  /** A second, muted line in the tooltip, such as what an ⓘ explains. */
  tooltipDetail?: string
  /** The same action's key, already formatted ("⌘,"): a Kbd in the tooltip. */
  shortcut?: string
  /** A toggle's state, as aria-pressed: a pinned or an active control. */
  pressed?: boolean
}

/**
 * A button that shows only an icon (MAR-3616, R2). Its label is both its
 * aria-label and its tooltip, so it is never unnamed and never needs a
 * native `title`. It takes Button's props, variants and the R3 sizes (ghost
 * and md, 32 px, unless told otherwise; 24 px in rows, chips and toolbars,
 * 28 px in headers and panels), and works as a trigger through `render` or
 * Radix's `asChild`. Unavailable with a reason (`disabledReason`), it stays
 * focusable and its tooltip adds why.
 */
function IconButton({
  label,
  tooltipSide,
  tooltipDetail,
  shortcut,
  pressed,
  variant = 'ghost',
  size = 'md',
  ...props
}: IconButtonProps) {
  return (
    <ButtonBase
      variant={variant}
      size={size}
      aria-pressed={pressed}
      {...props}
      shape="icon"
      aria-label={label}
      {...tooltipAttributes(label, {
        side: tooltipSide,
        detail: tooltipDetail,
        shortcut,
      })}
    />
  )
}

export { IconButton, type IconButtonProps }
