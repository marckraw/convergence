import { useEffect, useRef } from 'react'

export const NEEDS_YOU_CLOCK_INTERVAL_MS = 60_000

/**
 * The clock behind the Needs You feed's relative times (MAR-2994).
 *
 * The cards say "4 minutes ago", which is a statement about `now`, not about
 * the session — so something has to re-render them every minute. Before this
 * hook that was an unconditional `setInterval` in the sidebar container: it
 * ticked all night for a feed with nothing in it, waking React once a minute
 * to recompute an empty list.
 *
 * Gating it on the feed is not quite enough on its own. A clock that is merely
 * stopped while empty resumes with a stale `now`, so the first card to arrive
 * after a quiet hour renders "an hour ago" and stays wrong until the first
 * restarted tick a minute later. So arrival refreshes the clock immediately and
 * then ticks; emptying cancels it.
 *
 * Pausing is safe because `now` only reaches the card's `lastMoved` label:
 * `needsYouCardModel` and `groupNeedsYou` decide presence and grouping from the
 * session rows alone. No card can appear merely because time passed, so a
 * stopped clock cannot hide one.
 *
 * `onTick` is held in a ref: the timer's lifetime must follow the feed, not the
 * identity of a callback that the container may re-create on any render.
 */
export function useFeedClock(
  hasCards: boolean,
  onTick: (now: number) => void,
): void {
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  useEffect(() => {
    if (!hasCards) return

    onTickRef.current(Date.now())
    const timer = window.setInterval(
      () => onTickRef.current(Date.now()),
      NEEDS_YOU_CLOCK_INTERVAL_MS,
    )
    return () => window.clearInterval(timer)
  }, [hasCards])
}
