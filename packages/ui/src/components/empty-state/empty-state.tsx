import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { useDelayedLoading } from '../../motion/delayed-loading/useDelayedLoading'
import { Spinner } from '../../motion/spinner/spinner'
import { Button } from '../button/button'

/**
 * Its box. `dashed` is the app's most common empty box (30 of them): a dashed
 * hairline round the words. `plain` has no box, for a pane that is its own.
 */
type EmptyStateVariant = 'plain' | 'dashed'

/**
 * `compact` is for sidebars and pickers: smaller print, less room round it.
 * `page` is a screen with nothing else on it (the welcome, a route that leads
 * nowhere): its title is the page's heading, an h1 in the large print.
 */
type EmptyStateSize = 'default' | 'compact' | 'page'

/** `top` sits where the list would start; `centred` fills its parent and sits in its middle. */
type EmptyStateLayout = 'top' | 'centred'

type EmptyStateShared = {
  variant?: EmptyStateVariant
  size?: EmptyStateSize
  layout?: EmptyStateLayout
  className?: string
}

type EmptyStateEmptyProps = EmptyStateShared & {
  /** There's nothing to show: none yet, or none that match. The default. */
  state?: 'empty'
  /** A picture of what's missing, drawn small and muted. */
  icon?: LucideIcon
  /** What's the matter, with no full stop: "No sessions yet", "No skills match “lint”". */
  title?: ReactNode
  /** More about it, in sentences: "Start one from the composer." */
  detail?: ReactNode
  /** What to do about it: a Button or two. */
  action?: ReactNode
}

type EmptyStateLoadingProps = EmptyStateShared & {
  /** It's on its way. */
  state: 'loading'
  /** What's loading, in words, with the ellipsis character: "Loading sessions…". */
  title: ReactNode
}

type EmptyStateFailedProps = EmptyStateShared & {
  /** It couldn't load: an alert, with a way to try again. */
  state: 'failed'
  icon?: LucideIcon
  /** What failed, with no full stop: "Couldn't load the skills". */
  title?: ReactNode
  /** Why, or what to do, in sentences: "The provider didn't answer." */
  detail?: ReactNode
  /** Shows a Try again button. */
  onRetry?: () => void
  /** Trying again now: the button says so once it has taken 300 ms, and ignores more presses. */
  retrying?: boolean
}

type EmptyStateProps =
  | EmptyStateEmptyProps
  | EmptyStateLoadingProps
  | EmptyStateFailedProps

const VARIANTS: Record<EmptyStateVariant, string> = {
  plain: '',
  dashed: 'rounded-lg border border-dashed border-line',
}

const SIZES: Record<EmptyStateSize, string> = {
  default: 'px-4 py-5 text-sm',
  compact: 'px-3 py-2 text-xs',
  page: 'gap-2 px-6 py-5 text-sm',
}

/** The title's print: a page's is its heading (NAV-19: one weight for the welcome and the fallback). */
const TITLES: Record<EmptyStateSize, string> = {
  default: 'font-medium text-ink',
  compact: 'font-medium text-ink',
  page: 'text-2xl font-semibold tracking-tight text-ink',
}

const LAYOUTS: Record<EmptyStateLayout, string> = {
  top: '',
  centred: 'h-full min-h-0 flex-1 justify-center',
}

const rootClasses = ({
  variant = 'dashed',
  size = 'default',
  layout = 'top',
  className,
}: EmptyStateShared) =>
  cn(
    'flex flex-col items-center gap-1 text-center',
    VARIANTS[variant],
    SIZES[size],
    LAYOUTS[layout],
    className,
  )

/** Words that stay in the middle, however long: a long query breaks rather than overflows. */
const words = 'max-w-sm text-balance wrap-anywhere'
/** A page's words have a page's measure. */
const pageWords = 'max-w-md text-balance wrap-anywhere'

type ContentProps = {
  icon?: LucideIcon
  title?: ReactNode
  detail?: ReactNode
  size: EmptyStateSize
}

/** The picture, the heading and the sentences, stacked in the middle. */
function Content({ icon: Icon, title, detail, size }: ContentProps) {
  const measure = size === 'page' ? pageWords : words
  const Title = size === 'page' ? 'h1' : 'p'
  return (
    <>
      {Icon ? (
        <Icon
          aria-hidden
          className={cn(
            'mb-1 shrink-0 text-ink-muted',
            size === 'compact' ? 'size-4' : 'size-5',
          )}
        />
      ) : null}
      {title ? (
        <Title className={cn(measure, TITLES[size])}>{title}</Title>
      ) : null}
      {detail ? (
        <p
          className={cn(
            measure,
            'text-ink-muted',
            size === 'page' && 'leading-6',
          )}
        >
          {detail}
        </p>
      ) : null}
    </>
  )
}

const actionRow = 'mt-2 flex flex-wrap justify-center gap-2'
const pageActionRow = 'mt-4 flex flex-wrap justify-center gap-2'

/**
 * On its way: nothing for the first 300 ms, so a quick load shows nothing at
 * all, then a spinner and the words, which fade in. It's a status, so a
 * screen reader says the words when they appear.
 */
function LoadingState(props: EmptyStateLoadingProps) {
  const shown = useDelayedLoading(true)
  return (
    <div
      role="status"
      data-slot="empty-state"
      data-state="loading"
      className={rootClasses(props)}
    >
      {shown ? (
        <p className="flex items-center gap-2 text-ink-muted transition-opacity starting:opacity-0">
          <Spinner size={props.size === 'compact' ? 'xs' : 'sm'} />
          {props.title}
        </p>
      ) : null}
    </div>
  )
}

/** It couldn't load: the words are an alert, and Try again shows it's busy while it retries. */
function FailedState(props: EmptyStateFailedProps) {
  const { icon, title, detail, onRetry, retrying = false } = props
  const size = props.size ?? 'default'
  const busy = useDelayedLoading(retrying)
  return (
    <div
      data-slot="empty-state"
      data-state="failed"
      className={rootClasses(props)}
    >
      <div role="alert" className="flex flex-col items-center gap-1">
        <Content icon={icon} title={title} detail={detail} size={size} />
      </div>
      {onRetry ? (
        <div className={actionRow}>
          <Button
            variant="secondary"
            size="sm"
            pending={busy}
            pendingLabel="Trying again…"
            onClick={() => {
              if (!retrying) onRetry()
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * What a list or a pane says when it has nothing to show (MAR-3616): that
 * it's loading, that it's empty (or nothing matches), or that it couldn't
 * load, with a way to try again. One look everywhere: a small muted glyph, a
 * medium-weight line, muted sentences under it and the action below, centred,
 * in the dashed box the app draws 30 times today.
 *
 * The words follow one pattern (R10), so every list speaks alike:
 * - Loading: `Loading <things>…`, with the ellipsis character.
 * - Nothing matches: `No <things> match “<query>”` as the title.
 * - A failure: `Couldn't <do what>` as the title, why in the detail, and
 *   `onRetry` for Try again.
 */
function EmptyState(props: EmptyStateProps) {
  if (props.state === 'loading') return <LoadingState {...props} />
  if (props.state === 'failed') return <FailedState {...props} />
  const { icon, title, detail, action } = props
  return (
    <div
      data-slot="empty-state"
      data-state="empty"
      className={rootClasses(props)}
    >
      <Content
        icon={icon}
        title={title}
        detail={detail}
        size={props.size ?? 'default'}
      />
      {action ? (
        <div className={props.size === 'page' ? pageActionRow : actionRow}>
          {action}
        </div>
      ) : null}
    </div>
  )
}

export {
  EmptyState,
  type EmptyStateLayout,
  type EmptyStateProps,
  type EmptyStateSize,
  type EmptyStateVariant,
}
