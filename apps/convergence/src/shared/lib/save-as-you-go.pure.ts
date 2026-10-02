/**
 * One save, built when it is asked for and run after any save still under
 * way. It reports its own failure (the store keeps the error, or the dialog
 * shows it): the scheduler only orders saves.
 */
export type SaveWork = () => Promise<void>

/** The clock a scheduler waits on: the window's timers, or a test's. */
export interface SaveTimers {
  set: (run: () => void, delayMs: number) => unknown
  clear: (handle: unknown) => void
}

/**
 * Saves as you go (R6), for a dialog that keeps each change as it is made:
 * a choice at once (`scheduleSave(0)`), typing once it pauses, and whatever
 * still waits when the dialog closes or the view goes (`flush`).
 */
export interface SaveAsYouGo {
  /** Saves now, after any save under way; a save still waiting goes with it. */
  saveNow: () => void
  /** Saves after `delayMs`; a change in the meantime starts the wait again and saves both, once. */
  scheduleSave: (delayMs: number) => void
  /** Saves now only if one is waiting: leaving keeps typing that hasn't saved yet. */
  flush: () => void
}

/**
 * The save-as-you-go scheduler Settings, Project settings and the Space
 * workboard each wrote by hand (DLG earlier new thing 4), as one.
 *
 * `prepare` runs when the save is asked for, not when its turn comes, so it
 * reads what must be fixed at that moment (the Space being edited, whether
 * the dialog had loaded) and returns the save, or null when there is
 * nothing to save. Saves run one after another, in the order asked; one
 * that fails doesn't stop the next.
 */
export function createSaveAsYouGo(
  prepare: () => SaveWork | null,
  timers: SaveTimers,
): SaveAsYouGo {
  let waiting: unknown = null
  let saves: Promise<void> = Promise.resolve()

  const cancelWaiting = () => {
    if (waiting === null) return
    timers.clear(waiting)
    waiting = null
  }

  const saveNow = () => {
    cancelWaiting()
    const work = prepare()
    if (work === null) return
    saves = saves.then(work).catch(() => undefined)
  }

  const scheduleSave = (delayMs: number) => {
    cancelWaiting()
    waiting = timers.set(saveNow, delayMs)
  }

  const flush = () => {
    if (waiting !== null) saveNow()
  }

  return { saveNow, scheduleSave, flush }
}
