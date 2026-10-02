import { useCallback, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { headerFocusTarget } from './conversation-header.container'
import { useParallelWork } from './use-parallel-work'

/** The row the panel shows, for the session it was chosen in. */
interface ParallelSelection {
  sessionId: string
  id: string | null
}

/** Where the transcript jumps; a new nonce jumps to the same row again. */
interface ParallelNavigation {
  id: string
  nonce: number
}

/**
 * The Parallel work panel as a conversation hosts it (MAR-3618): its rows,
 * whether it is open, the row it shows, the transcript's jump target, and
 * who gets focus back when it closes. The session view and the chat surface
 * both host the panel; this is the one copy of its wiring, so the two can't
 * drift apart.
 *
 * `viewTrigger` is the header's View menu: Parallel work's history opens from
 * there, and focus falls back to it when the row's button has gone.
 */
export function useParallelWorkPanel(
  activeSessionId: string | null,
  viewTrigger: RefObject<HTMLButtonElement | null>,
) {
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<ParallelSelection | null>(null)
  const [navigation, setNavigation] = useState<ParallelNavigation | null>(null)
  /** The row's Parallel work button, in the header. */
  const button = useRef<HTMLButtonElement>(null)
  /** What opened the panel: it gets focus back when the panel closes. */
  const invoker = useRef<HTMLElement | null>(null)
  const work = useParallelWork(activeSessionId)
  // The transcript is a memo boundary (MAR-3310 F1e R2): what it is handed
  // keeps its identity until what it does changes.
  const select = useCallback(
    (id: string | null) => {
      if (!open && document.activeElement instanceof HTMLElement)
        invoker.current = document.activeElement
      if (activeSessionId) setSelection({ sessionId: activeSessionId, id })
      setOpen(true)
    },
    [open, activeSessionId],
  )
  // The panel hands focus back to what opened it: the row's Parallel work
  // button, or View when it was opened from there -- and More in View's
  // place when View has yielded (MAR-3427 D, MAR-3429 CH4 R1).
  const returnFocus = () =>
    headerFocusTarget(
      invoker.current?.isConnected
        ? invoker.current
        : (button.current ?? viewTrigger.current),
    )?.focus()
  // The close is committed before focus is decided: the row's button may
  // have left while the panel was open (nothing runs any more), so the target
  // is read from the header as it is once the panel has closed.
  const close = () => {
    flushSync(() => setOpen(false))
    returnFocus()
  }
  const toggle = () => {
    if (open) close()
    else {
      invoker.current = button.current
      setOpen(true)
    }
  }
  // Parallel work's history, from View: the panel opens and gives focus back
  // to View when it closes.
  const openFromView = () => {
    invoker.current = viewTrigger.current
    setOpen(true)
  }
  const navigate = (id: string) =>
    setNavigation((previous) => ({
      id,
      nonce: (previous?.nonce ?? 0) + 1,
    }))
  /** The row chosen in this session, or none: a choice made in another doesn't carry over. */
  const selectedIdIn = (sessionId: string) =>
    selection?.sessionId === sessionId ? selection.id : null
  return {
    work,
    open,
    button,
    navigation,
    select,
    close,
    toggle,
    openFromView,
    navigate,
    returnFocus,
    selectedIdIn,
  }
}
