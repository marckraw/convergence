import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A popover that a resting pointer opens and a leaving one closes a moment
 * later (120 ms), so the pointer can cross from the pill to the panel: the
 * composer's Codex quota pill and its context dot (CONV-26, MAR-3617). One
 * copy of the timing for both.
 */
export function useHoverPopover() {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  const openPanel = useCallback(() => {
    clearCloseTimer()
    setOpen(true)
  }, [clearCloseTimer])

  const closePanelSoon = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      closeTimerRef.current = null
    }, 120)
  }, [clearCloseTimer])

  useEffect(() => clearCloseTimer, [clearCloseTimer])

  return { open, setOpen, openPanel, closePanelSoon, clearCloseTimer }
}
