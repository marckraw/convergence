import { Button as ButtonPrimitive } from '@base-ui/react/button'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'
import { toneInk, toneLine, toneSoft, type Tone } from '#lib/tone.styles'
import { tooltipAttributes } from '../tooltip/tooltip'

/**
 * The neutral pill draws no wash, as the conversation header's activity chip
 * doesn't: only the tones that say something are tinted.
 */
const fills: Record<Tone, string> = {
  neutral: '',
  info: toneSoft.info,
  success: toneSoft.success,
  warning: toneSoft.warning,
  danger: toneSoft.danger,
}

/** The pill's box, shared by the plain pill and the pressable one. */
const pillBox =
  'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border [&_svg]:pointer-events-none [&_svg]:shrink-0'

/**
 * How big a pill is: `default`, the 11 px pill of a state's label (the
 * conversation header's status row); `sm`, R3's 28 px with 12 px words, for a
 * pill that sits among a toolbar's `sm` controls (the composer's usage pills,
 * DS-9). Never a className (R3).
 */
type StatusPillSize = 'default' | 'sm'

/** Each size's height, padding and print. */
const pillSizes: Record<StatusPillSize, string> = {
  default: 'py-0.5 pl-2 text-2xs leading-2xs',
  sm: 'h-control-sm px-2 text-xs',
}

/** The leading glyph, a Spinner or a StatusDot, in its own slot. */
function Leading({ children }: { children: ReactNode }) {
  return <span className="flex shrink-0 items-center">{children}</span>
}

type StatusPillProps = Omit<ComponentProps<'span'>, 'className'> & {
  className?: string
  /** What the state says (R1). Which session state wears which tone is entities/session's map. */
  tone?: Tone
  /** Before the words: a glyph, a Spinner or a StatusDot. */
  leading?: ReactNode
  /**
   * At its end: what you can do about it. In the default pill, a Button of
   * size xs, tucked into the pill's end; in the `sm` pill, words that act (a
   * Button `variant="link"`), with the pill's room after them.
   */
  action?: ReactNode
  /** `default` unless told otherwise. */
  size?: StatusPillSize
}

/**
 * A state in a pill, in the 11 px step (R4): "Remote", "Worktree removed",
 * "Working". It is the conversation header's chip (MAR-3616): a full round
 * pill with the tone's line and ink, washed in the tone's tint when the tone
 * says something. Its words keep to one line and are cut short when there's
 * no room. Put a live region (role="status") on what holds it if its words
 * change while you watch.
 */
function StatusPill({
  tone = 'neutral',
  leading,
  action,
  size = 'default',
  className,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span
      data-slot="status-pill"
      data-tone={tone}
      data-size={size}
      className={cn(
        pillBox,
        pillSizes[size],
        size === 'default' && (action == null ? 'pr-2' : 'pr-0.5'),
        toneLine[tone],
        toneInk[tone],
        fills[tone],
        className,
      )}
      {...props}
    >
      {leading == null ? null : <Leading>{leading}</Leading>}
      <span className="min-w-0 truncate">{children}</span>
      {action}
    </span>
  )
}

type StatusPillButtonProps = Omit<
  ButtonPrimitive.Props,
  'className' | 'title'
> & {
  className?: string
  /** What the state says (R1). */
  tone?: Tone
  /** Before the words: a glyph, a Spinner or a StatusDot. */
  leading?: ReactNode
  /** `default` unless told otherwise. */
  size?: StatusPillSize
  /**
   * With no words, only its leading glyph (the composer's context dot): its
   * name and its tooltip from one string (R2), as IconButton's label. The
   * pill is then round.
   */
  label?: string
}

/**
 * A StatusPill you can press (MAR-3617): a state that opens what it is about,
 * such as the header's "2 running" (Parallel work), a harness alert (Details)
 * or the wires (a popover). The same box, print and tone as the pill beside
 * it, so the header's status row is one height (CONV-3), with the focus ring,
 * a hover fill and `app-no-drag`. It reaches 4 px further all round under the
 * pointer, so its target is never under 24 px. A trigger through `render`
 * (`<PopoverTrigger render={<StatusPillButton …/>}>`).
 */
function StatusPillButton({
  tone = 'neutral',
  leading,
  size = 'default',
  label,
  className,
  children,
  ...props
}: StatusPillButtonProps) {
  const glyphOnly = children == null
  return (
    <ButtonPrimitive
      data-slot="status-pill"
      data-tone={tone}
      data-size={size}
      className={cn(
        pillBox,
        pillSizes[size],
        glyphOnly ? 'aspect-square justify-center px-0' : 'pr-2',
        'relative transition-colors app-no-drag after:absolute after:-inset-1',
        'hover:bg-fill-hover disabled:opacity-50',
        focusRing,
        toneLine[tone],
        toneInk[tone],
        fills[tone],
        className,
      )}
      {...props}
      {...(label === undefined
        ? {}
        : { 'aria-label': label, ...tooltipAttributes(label) })}
    >
      {leading == null ? null : <Leading>{leading}</Leading>}
      {glyphOnly ? null : <span className="min-w-0 truncate">{children}</span>}
    </ButtonPrimitive>
  )
}

export {
  StatusPill,
  StatusPillButton,
  type StatusPillButtonProps,
  type StatusPillProps,
  type StatusPillSize,
}
