import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * A callback whose identity never changes but which always runs the latest
 * `fn` (MAR-3378 F1b). The sidebar hands these to memoized lists: the
 * parent's handlers close over fresh state on every render, and a new
 * identity each time would defeat every `memo` below.
 *
 * Only for event handlers, called after commit, never during render.
 */
export function useStableCallback<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(fn)
  useLayoutEffect(() => {
    latest.current = fn
  })
  return useCallback((...args: Args) => latest.current(...args), [])
}
