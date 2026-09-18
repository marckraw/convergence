import { useCallback, useEffect, useRef } from 'react'
import {
  clampWavePanelWidth,
  WAVE_PANEL_WIDTH_STEP,
} from './wave-sections.pure'

/**
 * The column's drag, keyboard and reset gestures (MAR-3155 R4).
 *
 * A hook rather than anything inside a presentational: it listens on the
 * window and writes `document.body`, which is orchestration. The pointer's
 * `clientX` is a page coordinate, so the column's width is `clientX` minus
 * whatever stands to its left -- the sidebar's current width, which the shell
 * already passes as `reservedWidth`.
 *
 * Only a FINISHED gesture commits (R2). While a drag runs the draft is on
 * screen and nothing is stored; a drag interrupted by an unmount gives back
 * the cursor it borrowed and stores nothing at all.
 */
export interface WaveColumnResize {
  onHandleMouseDown: () => void
  onHandleKeyDown: (event: { key: string; preventDefault: () => void }) => void
  onHandleDoubleClick: () => void
}

export function useWaveColumnResize(input: {
  reservedWidth: number
  /** The width on screen now: the decision's, already clamped. */
  width: number | null
  /** The widest the column may be right now: `min(MAX, available)`. */
  maxWidth: number
  /** Commits a finished gesture. */
  onCommit: (width: number) => void
  /** The width a double-click returns to. */
  defaultWidth: number
  /** The live drag, or null when none is running; the caller renders it. */
  onDraft: (width: number | null) => void
}): WaveColumnResize {
  // The listeners are installed once per drag and must see today's numbers,
  // not the ones captured when the drag began: the window can be resized
  // under a held pointer, and the commit has to store what is on screen.
  const latest = useRef(input)
  useEffect(() => {
    latest.current = input
  })
  // Set while a drag is running, so an unmount mid-drag can tell that the
  // body still carries a cursor this hook borrowed.
  const releaseDrag = useRef<(() => void) | null>(null)

  const onHandleMouseDown = useCallback(() => {
    if (releaseDrag.current) return
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    // The pointer's own last word, kept here rather than read back off the
    // rendered width: a mouse-up that arrives in the same task as the last
    // mouse-move has had no render in between, and reading the screen there
    // would commit the width from BEFORE the gesture.
    let dragged: number | null = null

    const onMouseMove = (event: MouseEvent) => {
      dragged = event.clientX - latest.current.reservedWidth
      latest.current.onDraft(dragged)
    }
    const stop = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      releaseDrag.current = null
    }
    const onMouseUp = () => {
      const moved = dragged
      stop()
      latest.current.onDraft(null)
      // A press that never moved is not a resize: nothing to store.
      if (moved === null) return
      latest.current.onCommit(
        clampWavePanelWidth(moved, latest.current.maxWidth),
      )
    }

    releaseDrag.current = stop
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  useEffect(
    () => () => {
      // Unmounted mid-drag: the listeners and the body's cursor are this
      // hook's to give back, and nothing is committed -- the gesture never
      // finished.
      releaseDrag.current?.()
    },
    [],
  )

  const onHandleKeyDown = useCallback(
    (event: { key: string; preventDefault: () => void }) => {
      const step =
        event.key === 'ArrowRight'
          ? WAVE_PANEL_WIDTH_STEP
          : event.key === 'ArrowLeft'
            ? -WAVE_PANEL_WIDTH_STEP
            : 0
      if (step === 0) return
      const current = latest.current.width
      if (current === null) return
      event.preventDefault()
      // Through the same clamp as the drag, so a step at the edge stores what
      // it shows rather than a preference nothing on screen agrees with.
      latest.current.onCommit(
        clampWavePanelWidth(current + step, latest.current.maxWidth),
      )
    },
    [],
  )

  const onHandleDoubleClick = useCallback(() => {
    latest.current.onCommit(
      clampWavePanelWidth(latest.current.defaultWidth, latest.current.maxWidth),
    )
  }, [])

  return { onHandleMouseDown, onHandleKeyDown, onHandleDoubleClick }
}
