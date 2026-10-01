import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
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
        'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border py-0.5 pl-2 text-2xs leading-2xs',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0',
        action == null ? 'pr-2' : 'pr-0.5',
        toneLine[tone],
        toneInk[tone],
        fills[tone],
        className,
      )}
      {...props}
    >
      {leading == null ? null : (
        <span className="flex shrink-0 items-center">{leading}</span>
      )}
      <span className="min-w-0 truncate">{children}</span>
      {action}
    </span>
  )
}

export { StatusPill, type StatusPillProps }
