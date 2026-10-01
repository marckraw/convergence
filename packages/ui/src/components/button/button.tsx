import { Button as ButtonPrimitive } from '@base-ui/react/button'
import type { ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'
import { press } from '../../motion/press/press.styles'
import { Spinner } from '../../motion/spinner/spinner'

/**
 * What a button means (MAR-3616, R5), each in today's look (R0):
 *
 * - `primary`: the one main action in a view (today's `default`).
 * - `secondary`: a second choice beside the primary, such as Cancel or Back
 *   (today's `outline`, its edge now the control border, DS-16).
 * - `tonal`: the main action inside a dense panel, where primary would shout
 *   (today's `secondary`).
 * - `ghost`: quiet toolbar and list actions.
 * - `quiet`: quieter still, beside the content: muted ink, ink on hover.
 * - `link`: words that act. No box: `size` does not apply.
 * - `danger`: the confirming destructive action (today's `destructive`).
 * - `danger-quiet`: a quiet red in a list or a toolbar; red is a variant,
 *   never a className (R5).
 */
const VARIANTS = {
  primary: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
  secondary:
    'border border-control-border bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
  tonal:
    'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  quiet: 'text-muted-foreground hover:bg-accent hover:text-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
  danger:
    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
  'danger-quiet':
    'text-destructive hover:bg-destructive/10 hover:text-destructive',
} as const

/**
 * One size scale for every control (R3): 24, 28, 32 and 36 px. Each recipe
 * is the most common copy at its height today (R0); `md` was the kit's `sm`
 * and `lg` its default.
 */
const TEXT_SIZES = {
  xs: 'h-6 gap-1 px-2 text-[11px]',
  sm: 'h-7 gap-1.5 px-2 text-xs',
  md: 'h-8 gap-2 px-3 text-xs',
  lg: 'h-9 gap-2 px-4 py-2 text-sm',
} as const

/**
 * The same scale, square, for a button that shows only an icon. The 24 px
 * one reaches 4 px further all round under the pointer, without looking any
 * bigger: it is where today's 16 and 20 px icon buttons land (R3).
 */
const ICON_SIZES = {
  xs: 'relative size-6 after:absolute after:-inset-1',
  sm: 'size-7',
  md: 'size-8',
  lg: 'size-9',
} as const

type ButtonVariant = keyof typeof VARIANTS
type ButtonSize = keyof typeof TEXT_SIZES
type ButtonShape = 'text' | 'icon'

const base = [
  'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium app-no-drag',
  focusRing,
  press,
  // A native disabled button takes no pointer; one disabled with a reason
  // (aria-disabled) keeps it, so its tooltip can say why (R2).
  'disabled:pointer-events-none disabled:opacity-50 data-disabled:opacity-50',
  // Today's glyph rule, kept: an icon is 16 px unless it names a size-*.
  "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
].join(' ')

type ButtonVariantOptions = {
  variant?: ButtonVariant
  size?: ButtonSize
  shape?: ButtonShape
}

/**
 * The Button's classes, for something that isn't a Button but should look
 * like one, such as a link that opens a page. A link variant has no box: no
 * height, padding or text size, whatever the size.
 */
function buttonVariants({
  variant = 'primary',
  size = 'md',
  shape = 'text',
}: ButtonVariantOptions = {}): string {
  const box =
    variant === 'link'
      ? ''
      : shape === 'icon'
        ? ICON_SIZES[size]
        : TEXT_SIZES[size]
  return cn(base, VARIANTS[variant], box)
}

type ButtonProps = Omit<ButtonPrimitive.Props, 'className' | 'title'> & {
  className?: string
  /** What the button means; `primary` unless told otherwise. */
  variant?: ButtonVariant
  /** 24, 28, 32 or 36 px; `md` (32) unless told otherwise. Never a className (R3). */
  size?: ButtonSize
  /**
   * What it does is under way: a Spinner before the label (in place of an
   * icon button's icon) and aria-busy. A button given `pending` at all, true
   * or false, is as wide as its busy look from the start, so going busy moves
   * nothing. It stays clickable: what it does guards against repeats. Pass a
   * delayed flag (useDelayedLoading) so a quick answer never flashes it.
   */
  pending?: boolean
  /** The label while busy, in words that say so: "Saving…" (R10). Without one the label stays. */
  pendingLabel?: ReactNode
  /**
   * Why it is unavailable (R2). The button is disabled but stays focusable
   * (aria-disabled), its tooltip says why, and the reason is its accessible
   * description. Empty or missing: available, unless `disabled`.
   */
  disabledReason?: string
}

type ButtonBaseProps = ButtonProps & {
  /** Square, for one icon: IconButton's. */
  shape?: ButtonShape
}

type TooltipData = {
  'data-tooltip'?: string
  'data-tooltip-detail'?: string
}

/**
 * The one Button (MAR-3616), and IconButton's frame: Base UI's Button in
 * today's classes. It carries the focus ring, the press and `app-no-drag`
 * itself, so a call site adds none of them. A native `title` is not
 * accepted (R2): a text button that needs a hint sits in a Tooltip, and an
 * icon-only one is an IconButton.
 */
function ButtonBase({
  className,
  variant = 'primary',
  size = 'md',
  shape = 'text',
  pending,
  pendingLabel,
  disabledReason,
  disabled,
  focusableWhenDisabled,
  children,
  ...props
}: ButtonBaseProps) {
  const reason = disabledReason || undefined
  const tooltip = props as TooltipData
  // With a tooltip of its own (an IconButton's label, an outer Tooltip), the
  // reason is the tooltip's second line; otherwise the reason is the tooltip.
  const reasonTooltip: TooltipData = reason
    ? tooltip['data-tooltip']
      ? {
          'data-tooltip-detail': tooltip['data-tooltip-detail']
            ? `${tooltip['data-tooltip-detail']}\n${reason}`
            : reason,
        }
      : { 'data-tooltip': reason }
    : {}
  return (
    <ButtonPrimitive
      data-slot="button"
      data-size={variant === 'link' ? undefined : size}
      aria-busy={pending === true ? true : undefined}
      className={cn(buttonVariants({ variant, size, shape }), className)}
      {...props}
      {...reasonTooltip}
      // The reason is its description: an attribute, not text in the page,
      // so it never doubles a line that says the same thing beside it.
      aria-description={
        reason ?? describedAs(props) ?? hintOf(shape, tooltip, props)
      }
      disabled={disabled || Boolean(reason)}
      focusableWhenDisabled={reason ? true : focusableWhenDisabled}
    >
      {pending === undefined ? (
        children
      ) : (
        <BusyLabel
          pending={pending}
          pendingLabel={pendingLabel}
          iconOnly={shape === 'icon'}
        >
          {children}
        </BusyLabel>
      )}
    </ButtonPrimitive>
  )
}

/** A description the caller set itself, kept when there is no reason. */
const describedAs = (props: object): string | undefined =>
  (props as { 'aria-description'?: string })['aria-description']

/**
 * A text button's tooltip is the hint a native title used to be, and a title
 * was also its description: so is the tooltip, unless it only repeats the
 * button's name. An icon button's tooltip is its name already.
 */
const hintOf = (
  shape: ButtonShape,
  tooltip: TooltipData,
  props: object,
): string | undefined => {
  const hint = tooltip['data-tooltip']
  if (shape !== 'text' || !hint) return undefined
  return hint === (props as { 'aria-label'?: string })['aria-label']
    ? undefined
    : hint
}

/** Both looks in one grid cell, the one not shown hidden, so the wider sets the width. */
const busyLayer =
  'col-start-1 row-start-1 inline-flex items-center justify-center gap-[inherit]'

type BusyLabelProps = {
  pending: boolean
  pendingLabel: ReactNode
  iconOnly: boolean
  children: ReactNode
}

/**
 * The label and its busy look, stacked: the one not shown is invisible, so
 * its spinner doesn't turn, and aria-hidden, so it stays out of the
 * accessible name even where no stylesheet applies (jsdom reads "Save",
 * never "SaveSaving…").
 */
function BusyLabel({
  pending,
  pendingLabel,
  iconOnly,
  children,
}: BusyLabelProps) {
  return (
    <span data-slot="button-label" className="grid gap-[inherit]">
      <span
        className={cn(busyLayer, pending && 'invisible')}
        aria-hidden={pending || undefined}
      >
        {children}
      </span>
      <span
        className={cn(busyLayer, !pending && 'invisible')}
        aria-hidden={!pending || undefined}
      >
        <Spinner className={pending ? undefined : 'animate-none'} />
        {iconOnly ? null : (pendingLabel ?? children)}
      </span>
    </span>
  )
}

/** A button with words: Send, Cancel, Delete. See ButtonBase for what it carries. */
function Button(props: ButtonProps) {
  return <ButtonBase {...props} shape="text" />
}

export {
  Button,
  ButtonBase,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonVariants,
}
