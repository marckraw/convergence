import { RELAY_STALL_CHECK_INTERVAL_MS } from '../backend/relay/crew-hail.pure'

/** The one engine method the clock is allowed to reach. */
export interface StallCheckable {
  checkForStalls(now?: Date): void
}

export interface RelayStallClock {
  stop: () => void
}

/**
 * The stall hail's clock.
 *
 * Its own module rather than an inline `setInterval` in the bootstrap, for the
 * reason every other guard in this feature has a home: it is the ONLY thing
 * that notices a station that never came back. A settle-driven check cannot
 * see this — the whole failure is the settle that never arrives — so if this
 * stops ticking, the loop dies in silence again and every gate stays green.
 * Here it can be driven by fake timers and asserted.
 *
 * Unreferenced so a timer is never the reason the app will not quit, and the
 * tick swallows nothing: `checkForStalls` catches its own errors, because a
 * throw inside an interval takes the interval with it and the app would lose
 * stall hails for the rest of its life.
 */
export function startRelayStallClock(
  engine: StallCheckable,
  intervalMs: number = RELAY_STALL_CHECK_INTERVAL_MS,
): RelayStallClock {
  const timer = setInterval(() => {
    engine.checkForStalls()
  }, intervalMs)
  timer.unref?.()

  return {
    stop: () => clearInterval(timer),
  }
}
