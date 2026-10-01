import { X } from 'lucide-react'
import { type ComponentProps, type ReactNode, useId } from 'react'
import { cn } from '#lib/cn.pure'
import { focusRing } from '#lib/focus-ring.styles'
import { toneInk, toneLine, toneSoft, type Tone } from '#lib/tone.styles'

type NoticeProps = Omit<
  ComponentProps<'div'>,
  'className' | 'title' | 'children' | 'role'
> & {
  className?: string
  /** What it says about the state (R1): danger for a failure, warning for a heads-up. */
  tone?: Tone
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
  /** Puts it away: a ✕ at its top right, named "Not now". */
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
      className={cn(
        'flex items-start gap-2 rounded-lg border py-2 pl-3 text-sm',
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
          className="flex h-5 shrink-0 items-center [&_svg]:size-4"
        >
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
        // raw-element: DS3a's IconButton (xs, "Not now") replaces this button when it lands.
        <button
          type="button"
          aria-label="Not now"
          onClick={onDismiss}
          className={cn(
            'app-no-drag flex size-5 shrink-0 items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100',
            focusRing,
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

export { Notice, type NoticeProps }
