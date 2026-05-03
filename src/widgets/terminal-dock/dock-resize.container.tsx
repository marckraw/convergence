import type { FC, PointerEvent } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { useTerminalStore, type DockPlacement } from '@/entities/terminal'
import { cn } from '@/shared/lib/cn.pure'

interface DockResizeHandleProps {
  sessionId: string
  placement: DockPlacement
}

export const DockResizeHandle: FC<DockResizeHandleProps> = ({
  sessionId,
  placement,
}) => {
  const setDockHeight = useTerminalStore((s) => s.setDockHeight)
  const resetDockHeight = useTerminalStore((s) => s.resetDockHeight)
  const setDockWidth = useTerminalStore((s) => s.setDockWidth)
  const resetDockWidth = useTerminalStore((s) => s.resetDockWidth)

  const dragStateRef = useRef<{
    startX: number
    startY: number
    startSize: number
    pointerId: number
  } | null>(null)

  const handlePointerMove = useCallback(
    (event: globalThis.PointerEvent) => {
      const drag = dragStateRef.current
      if (!drag) return
      if (placement === 'bottom') {
        const delta = drag.startY - event.clientY
        setDockHeight(sessionId, drag.startSize + delta, window.innerHeight)
        return
      }
      const delta =
        placement === 'right'
          ? drag.startX - event.clientX
          : event.clientX - drag.startX
      setDockWidth(sessionId, drag.startSize + delta, window.innerWidth)
    },
    [sessionId, placement, setDockHeight, setDockWidth],
  )

  const handlePointerUp = useCallback(() => {
    dragStateRef.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }, [handlePointerMove])

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startSize =
      placement === 'bottom'
        ? useTerminalStore.getState().getDockHeight(sessionId)
        : useTerminalStore.getState().getDockWidth(sessionId)
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startSize,
      pointerId: event.pointerId,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const onDoubleClick = () => {
    if (placement === 'bottom') resetDockHeight(sessionId)
    else resetDockWidth(sessionId)
  }

  const isVertical = placement === 'bottom'

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? 'horizontal' : 'vertical'}
      aria-label="Resize terminal dock"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      data-testid="dock-resize-handle"
      data-placement={placement}
      className={cn(
        'shrink-0 bg-border/40 transition-colors hover:bg-border',
        isVertical
          ? 'h-1 w-full cursor-row-resize'
          : 'h-full w-1 cursor-col-resize',
      )}
    />
  )
}
