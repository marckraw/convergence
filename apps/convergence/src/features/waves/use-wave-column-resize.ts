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
 * What is stored is what the person MEANT (lap 2, A), and after lap 3 that
 * has one form for the two gestures that aim at a width:
 *
 * **a drag and a step store the width on screen when the gesture ENDS, and
 * store nothing when that equals the width on screen when it BEGAN.**
 *
 * The window's ceiling is what makes those differ: press or drag wider
 * against it and the screen does not move, so nothing was chosen and nothing
 * may be written down. Writing it down is how a 600 px preference became 400
 * forever -- the same loss through the keyboard (lap 2) and through the mouse
 * (lap 3), which is why the two now share one sentence instead of a list.
 *
 * A RESET is the one gesture whose meaning is not "what I see": it stores the
 * default, and the decision cuts that for display until the window grows.
 * And a gesture that ends with no column on screen stores nothing at all --
 * `column` is null then, from whatever reason took it away.
 */
export interface WaveColumnResize {
  onHandleMouseDown: () => void
  onHandleKeyDown: (event: { key: string; preventDefault: () => void }) => void
  onHandleDoubleClick: () => void
}

/**
 * The column on screen, or null when there is none (lap 3, B).
 *
 * ONE fact, computed once by the caller from every reason a column can be
 * absent -- the rail, Mission Control's own Waves tab, the last bound crew
 * going away. Asking any single one of them here would be asking a proxy:
 * the hook outlives the handle, so a drag can end while the column it was
 * resizing is gone.
 */
export interface WaveColumnOnScreen {
  /** The width on screen now: the decision's, already clamped. */
  width: number
  /** The widest this window can show right now, from the same decision. */
  maxWidth: number
}

export function useWaveColumnResize(input: {
  reservedWidth: number
  column: WaveColumnOnScreen | null
  /** Commits a finished gesture. */
  onCommit: (width: number) => void
  /** The width a double-click returns to. */
  defaultWidth: number
  /** The live drag, or null when none is running; the caller renders it. */
  onDraft: (width: number | null) => void
}): WaveColumnResize {
  // The listeners are installed once per drag and must see today's numbers,
  // not the ones captured when the drag began: the window can be resized
  // under a held pointer, and the commit has to weigh what is on screen.
  const latest = useRef(input)
  // A LAYOUT effect, not a passive one (lap 2, C): a passive effect leaves a
  // window between the commit and the flush in which a window listener would
  // read the previous render's numbers. Nothing can stage that in jsdom; the
  // effect's timing is the whole guard.
  useLayoutEffect(() => {
    latest.current = input
  })
  // Set while a drag is running: what it takes to give the window and the
  // body back.
  const releaseDrag = useRef<(() => void) | null>(null)

  const onHandleMouseDown = useCallback(() => {
    // Release any drag still installed before installing this one (lap 3, C).
    // Refusing to start instead would be worse than a leak: a mouse-up the
    // window never delivered -- released outside the frame -- would leave the
    // old listeners in place and the handle dead for the rest of the session.
    releaseDrag.current?.()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    // What the person was looking at when they took hold (lap 3, A). A drag
    // that ends on this same width changed nothing on screen, whatever the
    // pointer did -- dragging wider against the window's ceiling moves the
    // cursor and not the column.
    const startedAt = latest.current.column?.width ?? null
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
      const column = latest.current.column
      stop()
      // A press that never moved is not a resize; a drag that ended with no
      // column on screen resized nothing anybody saw.
      const settled =
        moved === null || column === null
          ? null
          : clampWavePanelWidth(moved, column.maxWidth)
      // Commit BEFORE clearing the draft (lap 3, C): the two are order-safe
      // only under automatic batching otherwise, and a draft cleared first
      // would flash the old width between them.
      if (settled !== null && settled !== startedAt) {
        latest.current.onCommit(settled)
      }
      latest.current.onDraft(null)
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
      const column = latest.current.column
      if (column === null) return
      event.preventDefault()
      const next = clampWavePanelWidth(column.width + step, column.maxWidth)
      // The window refused the step: nothing moved, so there is nothing the
      // person chose. Same sentence as the drag's, one line above its own.
      if (next === column.width) return
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
