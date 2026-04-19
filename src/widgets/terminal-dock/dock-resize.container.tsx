import type { FC, PointerEvent } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { useTerminalStore } from '@/entities/terminal'
import { cn } from '@/shared/lib/cn.pure'

interface DockResizeHandleProps {
  sessionId: string
}

export const DockResizeHandle: FC<DockResizeHandleProps> = ({ sessionId }) => {
  const setDockHeight = useTerminalStore((s) => s.setDockHeight)
  const resetDockHeight = useTerminalStore((s) => s.resetDockHeight)
  const dragStateRef = useRef<{
    startY: number
    startHeight: number
    pointerId: number
  } | null>(null)
  const activeRef = useRef(false)

  const handlePointerMove = useCallback(
    (event: globalThis.PointerEvent) => {
      const drag = dragStateRef.current
      if (!drag) return
      const delta = drag.startY - event.clientY
      const nextHeight = drag.startHeight + delta
      setDockHeight(sessionId, nextHeight, window.innerHeight)
    },
    [sessionId, setDockHeight],
  )

  const handlePointerUp = useCallback(() => {
    dragStateRef.current = null
    activeRef.current = false
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
    const currentHeight = useTerminalStore.getState().getDockHeight(sessionId)
    dragStateRef.current = {
      startY: event.clientY,
      startHeight: currentHeight,
      pointerId: event.pointerId,
    }
    activeRef.current = true
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const onDoubleClick = () => {
    resetDockHeight(sessionId)
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize terminal dock"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      data-testid="dock-resize-handle"
      className={cn(
        'h-1 w-full shrink-0 cursor-row-resize bg-border/40 transition-colors hover:bg-border',
      )}
    />
  )
}
