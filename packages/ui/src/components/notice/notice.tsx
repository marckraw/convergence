import { X } from 'lucide-react'
import { type ComponentProps, type ReactNode, useId } from 'react'
import { cn } from '#lib/cn.pure'
import { toneInk, toneLine, toneSoft, type Tone } from '#lib/tone.styles'
import { IconButton } from '../icon-button/icon-button'

/**
 * How big its words are (R3: a size is a prop, never a className). `md` is
 * the body size, the default; `sm` (12 px, the field text's size) is the one
 * compact size, for a dense place such as the composer's strip or a Mission
 * Control panel (ruling 10; one compact size, not two, Marcin, 2 Oct 2026).
 * The room around the words stays the default's (R0: it was most of theirs).
 */
const NOTICE_SIZES = {
  md: 'text-sm',
  sm: 'text-xs',
} as const

type NoticeSize = keyof typeof NOTICE_SIZES

type NoticeProps = Omit<
  ComponentProps<'div'>,
  'className' | 'title' | 'children' | 'role'
> & {
  className?: string
  /** What it says about the state (R1): danger for a failure, warning for a heads-up. */
  tone?: Tone
  /** Its words' size: `md` (14 px) unless told otherwise; `sm` 12 px, the one compact size (ruling 10). */
  size?: NoticeSize
  /** A 16 px glyph before the title, decorative: the words say it. */
  icon?: ReactNode
  /**
   * What happened, in a few words (R10): "Couldn't save the project." It
   * names the notice for a screen reader.
   */
  title: ReactNode
  /** The reason, or what to do, under the title. */
  children?: ReactNode
  /** Its buttons, under the words. */
  actions?: ReactNode
  /** Puts it away: a ✕ at its top right, an IconButton named and tooltipped "Not now". */
  onDismiss?: () => void
}

/**
 * A message in a box, in its tone (MAR-3616): an error after Save, a warning
 * before a fork, a success after a sign-in. The app's error box, kept (R0):
 * rounded-lg, a hairline in the tone's line, its soft tint, its ink, px-3
 * py-2 in the body size. Words follow R10: "Couldn't <verb> <thing>." with the
 * reason underneath.
 *
 * Danger and warning are announced when they appear (role="alert"), so an
 * error after Save is never silent (DS-5: 32 of 38 were); the rest are a
 * polite status. Mount it with its words, so the announcement carries them.
 */
function Notice({
  tone = 'neutral',
  size = 'md',
  icon,
  title,
  children,
  actions,
  onDismiss,
  className,
  ...props
}: NoticeProps) {
  const titleId = useId()
  const urgent = tone === 'danger' || tone === 'warning'
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      aria-labelledby={titleId}
      data-slot="notice"
      data-tone={tone}
      data-size={size}
      className={cn(
        'flex items-start gap-2 rounded-lg border py-2 pl-3',
        NOTICE_SIZES[size],
        onDismiss ? 'pr-1.5' : 'pr-3',
        toneLine[tone],
        toneSoft[tone],
        toneInk[tone],
        className,
      )}
      {...props}
    >
      {icon == null ? null : (
        <span
          aria-hidden
          // As tall as the title's first line, so the glyph sits on it.
          className={cn(
            'flex shrink-0 items-center [&_svg]:size-4',
            size === 'md' ? 'h-5' : 'h-4',
          )}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p id={titleId} className="font-medium wrap-anywhere">
          {title}
        </p>
        {children == null ? null : (
          <div className="wrap-anywhere">{children}</div>
        )}
        {actions == null ? null : (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {onDismiss ? (
        <IconButton
          label="Not now"
          size="xs"
          onClick={onDismiss}
          className="-my-0.5 shrink-0"
        >
          <X aria-hidden className="size-3.5" />
        </IconButton>
      ) : null}
    </div>
  )
}

export { Notice, type NoticeProps, type NoticeSize }
