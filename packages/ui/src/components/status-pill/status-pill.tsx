import { Button as ButtonPrimitive } from '@base-ui/react/button'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'
import { toneInk, toneLine, toneSoft, type Tone } from '#lib/tone.styles'

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

/** The pill's box and print, shared by the plain pill and the pressable one. */
const pillBox =
  'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border py-0.5 pl-2 text-2xs leading-2xs [&_svg]:pointer-events-none [&_svg]:shrink-0'

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
  /** At its end: what you can do about it, a Button of size xs. */
  action?: ReactNode
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
  className,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span
      data-slot="status-pill"
      data-tone={tone}
      className={cn(
        pillBox,
        action == null ? 'pr-2' : 'pr-0.5',
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
  className,
  children,
  ...props
}: StatusPillButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="status-pill"
      data-tone={tone}
      className={cn(
        pillBox,
        'relative pr-2 transition-colors app-no-drag after:absolute after:-inset-1',
        'hover:bg-fill-hover disabled:opacity-50',
        focusRing,
        toneLine[tone],
        toneInk[tone],
        fills[tone],
        className,
      )}
      {...props}
    >
      {leading == null ? null : <Leading>{leading}</Leading>}
      <span className="min-w-0 truncate">{children}</span>
    </ButtonPrimitive>
  )
}

export {
  StatusPill,
  StatusPillButton,
  type StatusPillButtonProps,
  type StatusPillProps,
}
