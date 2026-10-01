import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'

/** A slot on the strip: a row of controls that keep their clicks (app-no-drag). */
const stripSlot = 'app-no-drag flex shrink-0 items-center gap-1'

type ScreenHeaderProps = Omit<
  ComponentProps<'header'>,
  'className' | 'title'
> & {
  className?: string
  /** Before the title: a way back, a mark, the sidebar's toggle. */
  start?: ReactNode
  /** The screen's name: its heading's words. Cut short when there's no room. */
  title?: ReactNode
  /** The heading's id, for what it names (a pane's aria-labelledby). */
  titleId?: string
  /** 1 for a screen; 2 for a panel inside one. */
  headingLevel?: 1 | 2
  /** After the heading on its line, not part of its name: a Badge, a menu. */
  titleAction?: ReactNode
  /** Under the title on the same 48 px row, small and muted: where it is, a count. */
  subtitle?: ReactNode
  /** At the end: the screen's actions and menus. */
  end?: ReactNode
  /** Rows under the 48 px row, inside the header: the conversation header's status rows. */
  children?: ReactNode
  /** The strip drags the window (Electron), as every top strip should; true unless told otherwise. */
  drag?: boolean
  /** Room at its start for macOS's traffic lights, when it sits at the window's left edge. */
  windowControlsInset?: boolean
}

/**
 * The top strip of a screen or a pane (MAR-3616): today's strip, copied ten
 * times (NAV-4), as one part. A 48 px row with a hairline under it: what comes
 * before the title, the title, and what comes at the end, with any extra rows
 * under it.
 *
 * It owns the window's drag region (R12): the strip carries `app-drag`, so
 * the window moves from any empty part of it, and its start, title-action and
 * end slots carry `app-no-drag`, so every control in them takes its click.
 * Parts in `children` carry `app-no-drag` themselves.
 */
function ScreenHeader({
  start,
  title,
  titleId,
  headingLevel = 1,
  titleAction,
  subtitle,
  end,
  children,
  drag = true,
  windowControlsInset = false,
  className,
  ...props
}: ScreenHeaderProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h1'
  return (
    <header
      data-slot="screen-header"
      data-drag={drag ? '' : undefined}
      className={cn(
        'flex shrink-0 flex-col border-b border-line px-4',
        drag && 'app-drag',
        windowControlsInset && 'pl-20',
        className,
      )}
      {...props}
    >
      <div className="flex h-12 min-w-0 items-center gap-1.5">
        {start == null ? null : (
          <div data-slot="screen-header-start" className={stripSlot}>
            {start}
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {title == null ? null : (
            <div className="flex min-w-0 flex-col">
              <Heading
                id={titleId}
                className="truncate text-sm font-semibold text-ink"
              >
                {title}
              </Heading>
              {subtitle == null ? null : (
                <div className="truncate text-xs text-ink-muted">
                  {subtitle}
                </div>
              )}
            </div>
          )}
          {titleAction == null ? null : (
            <div data-slot="screen-header-title-action" className={stripSlot}>
              {titleAction}
            </div>
          )}
        </div>
        {end == null ? null : (
          <div data-slot="screen-header-end" className={stripSlot}>
            {end}
          </div>
        )}
      </div>
      {children}
    </header>
  )
}

type DragRegionProps = { className?: string }

/**
 * The bare drag strip, 48 px tall, for a screen with no header (the welcome,
 * loading and fallback screens), so the window still moves from its top.
 */
function DragRegion({ className }: DragRegionProps) {
  return (
    <div
      aria-hidden
      data-slot="drag-region"
      className={cn('app-drag h-12 w-full shrink-0', className)}
    />
  )
}

export {
  DragRegion,
  type DragRegionProps,
  ScreenHeader,
  type ScreenHeaderProps,
}
