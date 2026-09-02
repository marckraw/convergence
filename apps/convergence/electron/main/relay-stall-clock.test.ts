import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RELAY_STALL_CHECK_INTERVAL_MS } from '../backend/relay/crew-hail.pure'
import { startRelayStallClock } from './relay-stall-clock'

/**
 * The one guard nothing else can notice.
 *
 * A stalled station produces no settle, so the event the rest of this feature
 * rides on never arrives. If this clock stops ticking, a loop that dies gets
 * no hail and every suite in the repo stays green — which is exactly the class
 * of loss that has to be pinned by name.
 */
describe('the relay stall clock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks the engine on every tick, forever', () => {
    const checkForStalls = vi.fn()
    startRelayStallClock({ checkForStalls })

    expect(checkForStalls).not.toHaveBeenCalled()

    vi.advanceTimersByTime(RELAY_STALL_CHECK_INTERVAL_MS * 3)

    expect(checkForStalls).toHaveBeenCalledTimes(3)
  })

  it('stops when it is told to, and not before', () => {
    const checkForStalls = vi.fn()
    const clock = startRelayStallClock({ checkForStalls })

    vi.advanceTimersByTime(RELAY_STALL_CHECK_INTERVAL_MS)
    clock.stop()
    vi.advanceTimersByTime(RELAY_STALL_CHECK_INTERVAL_MS * 5)

    expect(checkForStalls).toHaveBeenCalledTimes(1)
  })

  it('ticks far finer than the window it measures', () => {
    // The tick's only job is to notice promptly once a window has passed. It
    // may run as often as it likes because the hail book refuses a duplicate
    // while one is still open — but a tick coarser than the window would let a
    // station sit stalled for a second window before anyone was told.
    expect(RELAY_STALL_CHECK_INTERVAL_MS).toBeLessThan(30 * 60_000)
  })
})
