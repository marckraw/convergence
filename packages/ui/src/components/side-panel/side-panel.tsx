import { X } from 'lucide-react'
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useId,
} from 'react'
import { cn } from '#lib/cn.pure'
import { focusRingInset } from '#lib/focus-ring.styles'
import { IconButton } from '../icon-button/icon-button'

/** The panel's width, from one token each: the PR and Space panels', or Parallel work's. */
const WIDTHS = {
  'side-panel': 'w-side-panel',
  'work-panel': 'w-work-panel',
} as const

type SidePanelWidth = keyof typeof WIDTHS

const SidePanelContext = createContext<{ titleId: string | undefined }>({
  titleId: undefined,
})

type SidePanelProps = Omit<ComponentProps<'aside'>, 'className'> & {
  className?: string
  /** side-panel (320 px, the PR and Space panels) unless told otherwise. */
  width?: SidePanelWidth
}

/**
 * A panel docked at the side of the conversation (MAR-3616): the PR, Space
 * and Parallel work panels, which have three headers, paddings and widths
 * today (CONV-20). A full-height column with a hairline at its start; its
 * PanelHeader's title names it. Put a PanelHeader and a SidePanelBody in it.
 */
function SidePanel({
  width = 'side-panel',
  className,
  ...props
}: SidePanelProps) {
  const titleId = useId()
  return (
    <SidePanelContext.Provider value={{ titleId }}>
      <aside
        aria-labelledby={titleId}
        data-slot="side-panel"
        className={cn(
          'flex h-full min-h-0 shrink-0 flex-col border-l border-line bg-canvas',
          WIDTHS[width],
          className,
        )}
        {...props}
      />
    </SidePanelContext.Provider>
  )
}

type PanelHeaderProps = Omit<
  ComponentProps<'div'>,
  'className' | 'title' | 'children'
> & {
  className?: string
  /** The panel's name: "Pull request". It names the panel. */
  title: ReactNode
  /** A 16 px glyph before the title, muted. */
  icon?: ReactNode
  /** Its actions before the close: IconButtons of size sm (Refresh). */
  actions?: ReactNode
  /** Closes the panel: a 28 px IconButton ✕ named and tooltipped "Close" at its end. */
  onClose?: () => void
}

/**
 * A side panel's head (MAR-3616): the PR panel's, kept (R0): a 48 px row
 * with a hairline under it, a muted glyph and the title in 14 px medium, its
 * actions and a 28 px ✕ named "Close" at its end, one size for every panel
 * (MC-11 counted five).
 */
function PanelHeader({
  title,
  icon,
  actions,
  onClose,
  className,
  ...props
}: PanelHeaderProps) {
  const { titleId } = useContext(SidePanelContext)
  return (
    <div
      data-slot="panel-header"
      className={cn(
        'flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-3',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        {icon == null ? null : (
          <span
            aria-hidden
            className="flex shrink-0 text-ink-muted [&_svg]:size-4"
          >
            {icon}
          </span>
        )}
        <h2 id={titleId} className="truncate text-sm font-medium text-ink">
          {title}
        </h2>
      </div>
      {actions == null && onClose == null ? null : (
        <div className="app-no-drag flex shrink-0 items-center gap-1">
          {actions}
          {onClose == null ? null : (
            <IconButton
              label="Close"
              size="sm"
              variant="quiet"
              onClick={onClose}
            >
              <X aria-hidden className="size-3.5" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  )
}

type SidePanelBodyProps = Omit<ComponentProps<'div'>, 'className'> & {
  className?: string
}

/**
 * What the panel holds, scrolling on its own under the header, with p-4 round
 * it. It takes the focus, so the keyboard can scroll it even when nothing in
 * it is a control.
 */
function SidePanelBody({ className, ...props }: SidePanelBodyProps) {
  return (
    <div
      tabIndex={0}
      data-slot="side-panel-body"
      className={cn(
        'min-h-0 flex-1 space-y-4 overflow-y-auto p-4',
        focusRingInset,
        className,
      )}
      {...props}
    />
  )
}

export {
  PanelHeader,
  type PanelHeaderProps,
  SidePanel,
  SidePanelBody,
  type SidePanelBodyProps,
  type SidePanelProps,
  type SidePanelWidth,
}
