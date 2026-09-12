import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NEEDS_YOU_CLOCK_INTERVAL_MS, useFeedClock } from './use-feed-clock'

/**
 * The Needs You clock, driven across the transitions that MAR-2994 names:
 * empty -> populated -> empty. Real time never advances here; `vi.setSystemTime`
 * is the only thing that moves, so "the clock refreshed" and "an hour passed"
 * are separate facts the assertions can tell apart.
 */
const START = new Date('2026-09-12T09:00:00.000Z').getTime()
const AN_HOUR = 60 * 60 * 1000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the Needs You clock', () => {
  it('ticks once per second only while a reliable live duration is visible', () => {
    const tick = vi.fn()
    const { rerender } = renderHook(
      ({ live }) => useFeedClock(true, tick, live),
      { initialProps: { live: true } },
    )
    tick.mockClear()
    vi.advanceTimersByTime(3000)
    expect(tick).toHaveBeenCalledTimes(3)
    rerender({ live: false })
    tick.mockClear()
    vi.advanceTimersByTime(3000)
    expect(tick).not.toHaveBeenCalled()
    vi.advanceTimersByTime(57_000)
    expect(tick).toHaveBeenCalledTimes(1)
  })
  it('does not tick while the feed is empty (mutation: unconditional interval)', () => {
    const onTick = vi.fn()
    renderHook(() => useFeedClock(false, onTick))

    vi.advanceTimersByTime(AN_HOUR)

    expect(onTick).not.toHaveBeenCalled()
  })

  it('refreshes the moment cards arrive after a long gap (mutation: no immediate refresh)', () => {
    const onTick = vi.fn()
    const { rerender } = renderHook(
      ({ hasCards }: { hasCards: boolean }) => useFeedClock(hasCards, onTick),
      { initialProps: { hasCards: false } },
    )

    // An hour of nothing, then the first card.
    vi.setSystemTime(START + AN_HOUR)
    rerender({ hasCards: true })

    // Without the immediate refresh the card renders against the hour-old
    // `now` it was mounted with, and stays wrong until the first tick.
    expect(onTick).toHaveBeenCalledTimes(1)
    expect(onTick).toHaveBeenLastCalledWith(START + AN_HOUR)

    // ...and it keeps ticking each minute from there. `advanceTimersByTime`
    // moves the mocked clock too, so this is the same minute, counted once.
    vi.advanceTimersByTime(NEEDS_YOU_CLOCK_INTERVAL_MS)

    expect(onTick).toHaveBeenCalledTimes(2)
    expect(onTick).toHaveBeenLastCalledWith(
      START + AN_HOUR + NEEDS_YOU_CLOCK_INTERVAL_MS,
    )
  })

  it('cancels the timer when the last card goes (mutation: no cleanup)', () => {
    const onTick = vi.fn()
    const { rerender } = renderHook(
      ({ hasCards }: { hasCards: boolean }) => useFeedClock(hasCards, onTick),
      { initialProps: { hasCards: true } },
    )

    vi.advanceTimersByTime(NEEDS_YOU_CLOCK_INTERVAL_MS)
    const ticksWhilePopulated = onTick.mock.calls.length
    expect(ticksWhilePopulated).toBeGreaterThan(0)

    rerender({ hasCards: false })
    vi.advanceTimersByTime(AN_HOUR)

    expect(onTick).toHaveBeenCalledTimes(ticksWhilePopulated)
  })

  it('does not restart the interval when only the callback changes (mutation: add onTick to the effect deps)', () => {
    const onTick = vi.fn()
    // A fresh closure every render — what the container really passes once a
    // handler is inlined. If the effect depended on it the timer would be torn
    // down and rebuilt on each render, so a feed that renders more often than
    // once a minute would never reach a tick at all.
    const { rerender } = renderHook(
      ({ hasCards }: { hasCards: boolean }) =>
        useFeedClock(hasCards, (now) => onTick(now)),
      { initialProps: { hasCards: true } },
    )
    onTick.mockClear()

    vi.advanceTimersByTime(NEEDS_YOU_CLOCK_INTERVAL_MS / 2)
    rerender({ hasCards: true })
    vi.advanceTimersByTime(NEEDS_YOU_CLOCK_INTERVAL_MS / 2)

    // The count alone would not catch it: a restarted effect fires its own
    // immediate refresh, which is also exactly one call. The instant is what
    // separates them — one tick, on the minute, not at the re-render.
    expect(onTick).toHaveBeenCalledTimes(1)
    expect(onTick).toHaveBeenLastCalledWith(START + NEEDS_YOU_CLOCK_INTERVAL_MS)
  })
})
