import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import type { ReactElement, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { popupMotion } from '../../motion/popup.styles'
import { tooltipSurface } from './tooltip.styles'

type TooltipCardProps = {
  /** The body: a list, a summary, two lines with their own weights. */
  content: ReactNode
  /** Where it shows; above unless told otherwise or that doesn't fit. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** How it lines up along that side. */
  align?: 'start' | 'center' | 'end'
  /** Extra classes for the card, such as a wider `max-w-*` for a long list. */
  className?: string
  /** What it explains: one element that takes a ref and passes props on. */
  children: ReactElement
}

/**
 * A tooltip with more than a label (MAR-3616): the needs-you names, the
 * status bar's summaries, the agent meter. Base UI's Tooltip, so it opens on
 * hover and on keyboard focus alike (the status bar's summary was mouse-only,
 * NAV-26), in the Tooltip's glass and motion, after the same delay
 * (UiProvider). A plain label is a Tooltip, never this.
 */
function TooltipCard({
  content,
  side = 'top',
  align = 'center',
  className,
  children,
}: TooltipCardProps) {
  return (
    <TooltipPrimitive.Root>
      {/* Marked, so the label tooltip host leaves this trigger to its card:
          an IconButton inside keeps its name without showing two tooltips. */}
      <TooltipPrimitive.Trigger data-tooltip-card="" render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={5}
          className="z-50 app-no-drag"
        >
          <TooltipPrimitive.Popup
            data-slot="tooltip-card"
            className={cn(tooltipSurface, popupMotion, className)}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { TooltipCard, type TooltipCardProps }
