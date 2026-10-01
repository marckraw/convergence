/** A loading state waits this long before it shows, so a quick answer never flashes one. */
export const LOADING_DELAY_MS = 300

/** Once shown, a loading state stays at least this long, so it never flickers. */
export const LOADING_MIN_VISIBLE_MS = 400

export type DelayedLoadingTiming = {
  delayMs: number
  minVisibleMs: number
}

const defaultTiming: DelayedLoadingTiming = {
  delayMs: LOADING_DELAY_MS,
  minVisibleMs: LOADING_MIN_VISIBLE_MS,
}

/**
 * Where a loading indicator is. Times are milliseconds on any clock that only goes forward (the
 * hook uses performance.now()).
 */
export type DelayedLoading =
  /** Nothing is loading, or it finished before the delay was up. */
  | { phase: 'idle' }
  /** Work is pending; the indicator is waiting out the delay. */
  | { phase: 'waiting'; since: number }
  /** The indicator shows, since `since`; it stays at least the minimum, even after work ends. */
  | { phase: 'visible'; since: number; pending: boolean }

export const idleLoading: DelayedLoading = { phase: 'idle' }

/**
 * The next state, given whether work is pending now and the time now. Returns the same object
 * when nothing changed, so React can skip the render.
 */
export function advanceDelayedLoading(
  state: DelayedLoading,
  pending: boolean,
  now: number,
  timing: DelayedLoadingTiming = defaultTiming,
): DelayedLoading {
  switch (state.phase) {
    case 'idle':
      return pending ? { phase: 'waiting', since: now } : state
    case 'waiting':
      if (!pending) return idleLoading
      return now - state.since >= timing.delayMs
        ? { phase: 'visible', since: now, pending: true }
        : state
    case 'visible':
      if (!pending && now - state.since >= timing.minVisibleMs)
        return idleLoading
      return state.pending === pending ? state : { ...state, pending }
  }
}

/** Whether the loading indicator shows. */
export function isLoadingVisible(state: DelayedLoading): boolean {
  return state.phase === 'visible'
}

/**
 * When the state next changes by itself (on the same clock): the end of the delay, or the end of
 * the minimum once work is done. null when only a change in pending can move it.
 */
export function nextLoadingChange(
  state: DelayedLoading,
  timing: DelayedLoadingTiming = defaultTiming,
): number | null {
  if (state.phase === 'waiting') return state.since + timing.delayMs
  if (state.phase === 'visible' && !state.pending)
    return state.since + timing.minVisibleMs
  return null
}
