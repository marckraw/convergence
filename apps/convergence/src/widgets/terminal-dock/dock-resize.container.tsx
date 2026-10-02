import type { FC } from 'react'
import {
  dockSizeBounds,
  useTerminalStore,
  type DockPlacement,
} from '@/entities/terminal'
import { ResizeHandle } from '@convergence/ui'

interface DockResizeHandleProps {
  sessionId: string
  placement: DockPlacement
}

/**
 * The line between the dock and the conversation (NAV-16): the kit's
 * ResizeHandle, so it is focusable, says its size and its range, moves with
 * the arrow keys (Home and End to its ends) as well as the pointer, and a
 * double-click puts the default size back. The store keeps the size, per
 * session, and clamps it to the window.
 */
export const DockResizeHandle: FC<DockResizeHandleProps> = ({
  sessionId,
  placement,
}) => {
  const atBottom = placement === 'bottom'
  const size = useTerminalStore((s) =>
    atBottom ? s.getDockHeight(sessionId) : s.getDockWidth(sessionId),
  )
  const setDockHeight = useTerminalStore((s) => s.setDockHeight)
  const resetDockHeight = useTerminalStore((s) => s.resetDockHeight)
  const setDockWidth = useTerminalStore((s) => s.setDockWidth)
  const resetDockWidth = useTerminalStore((s) => s.resetDockWidth)
  const windowSize = atBottom ? window.innerHeight : window.innerWidth
  const { min, max } = dockSizeBounds(placement, windowSize)

  return (
    <ResizeHandle
      // A dock at the bottom has a line across it, which sizes a height; a
      // dock at a side has a line down, which sizes a width.
      orientation={atBottom ? 'horizontal' : 'vertical'}
      // The dock sits after the line at the bottom and on the right, so
      // moving the line towards the start makes it larger.
      reverse={placement !== 'left'}
      value={size}
      min={min}
      max={max}
      label="Resize terminal dock"
      onChange={(next) => {
        if (atBottom) setDockHeight(sessionId, next, window.innerHeight)
        else setDockWidth(sessionId, next, window.innerWidth)
      }}
      onReset={() => {
        if (atBottom) resetDockHeight(sessionId)
        else resetDockWidth(sessionId)
      }}
    />
  )
}
