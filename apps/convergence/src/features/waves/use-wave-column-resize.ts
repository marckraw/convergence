import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
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
 * What is stored is what the person MEANT, and a gesture that changes nothing
 * on screen stores nothing (lap 2, A). That is the rule the three gestures
 * differ under:
 *
 * - a DRAG stores what was on screen when the pointer was let go -- they saw
 *   it, so that is what they chose;
 * - a STEP whose clamped result is the width already on screen stores
 *   nothing: the window refused the gesture, and writing the refusal down
 *   would turn "I pressed wider" into "I chose narrower, forever";
 * - a RESET stores the DEFAULT itself, never the window's ceiling. The
 *   decision cuts it for display and it comes back when the window does;
 * - a gesture that ends with no column on screen at all stores nothing.
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
  /**
   * The widest this window can show, straight from the decision -- null when
   * there is no column on screen, and then no gesture commits anything.
   */
  maxWidth: number | null
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
  // A LAYOUT effect, not a passive one (lap 2, C): a passive effect leaves a
  // window between the commit and the flush in which a window listener would
  // read the previous render's numbers. Nothing can stage that in jsdom; the
  // effect's timing is the whole guard.
  useLayoutEffect(() => {
    latest.current = input
  })
  // Set while a drag is running, so an unmount mid-drag can tell that the
  // body still carries a cursor this hook borrowed.
  const releaseDrag = useRef<(() => void) | null>(null)

  const onHandleMouseDown = useCallback(() => {
    // One live drag at a time. Measured (lap 2, D): with two installs the
    // second mouse-up is not needed -- BOTH handlers answer the same event,
    // so nothing leaks through the pointer. What this guard actually keeps
    // true is that `releaseDrag` names the drag that is running, so an
    // unmount releases the listeners that are really installed. No test in
    // jsdom can witness that; it is stated here instead of pinned.
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
      const ceiling = latest.current.maxWidth
      stop()
      latest.current.onDraft(null)
      // A press that never moved is not a resize: nothing to store.
      if (moved === null) return
      // And neither is a drag the window ended (lap 2, A): if the column
      // crossed the floor mid-drag there is a rail on screen, nothing to
      // have chosen, and a commit here would store a width nobody saw.
      if (ceiling === null) return
      latest.current.onCommit(clampWavePanelWidth(moved, ceiling))
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
      const ceiling = latest.current.maxWidth
      if (current === null || ceiling === null) return
      event.preventDefault()
      const next = clampWavePanelWidth(current + step, ceiling)
      // The window refused the step (lap 2, A): nothing moved, so there is
      // nothing the person chose. Committing here is how a 600 px preference
      // became 400 forever -- they pressed WIDER and lost their wide column.
      if (next === current) return
      latest.current.onCommit(next)
    },
    [],
  )

  const onHandleDoubleClick = useCallback(() => {
    // The DEFAULT itself, never the window's ceiling (lap 2, A): a reset in a
    // cramped window must not pin that window's ceiling as the preference.
    // The decision cuts it for display; it comes back when the window does.
    latest.current.onCommit(latest.current.defaultWidth)
  }, [])

  return { onHandleMouseDown, onHandleKeyDown, onHandleDoubleClick }
}
