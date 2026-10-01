import { describe, expect, it } from 'vitest'
import {
  advanceDelayedLoading,
  type DelayedLoading,
  idleLoading,
  isLoadingVisible,
  LOADING_DELAY_MS,
  LOADING_MIN_VISIBLE_MS,
  nextLoadingChange,
} from './delayed-loading.pure'

/** Plays a timeline of [time, pending] changes and reports what the indicator did at each step. */
const play = (steps: Array<[number, boolean]>) => {
  let state: DelayedLoading = idleLoading
  return steps.map(([now, pending]) => {
    state = advanceDelayedLoading(state, pending, now)
    return {
      now,
      visible: isLoadingVisible(state),
      wakeAt: nextLoadingChange(state),
    }
  })
}

describe('the agreed timings', () => {
  it('waits 300 ms and stays 400 ms', () => {
    expect(LOADING_DELAY_MS).toBe(300)
    expect(LOADING_MIN_VISIBLE_MS).toBe(400)
  })
})

describe('advanceDelayedLoading', () => {
  it('stays idle while nothing is pending', () => {
    expect(advanceDelayedLoading(idleLoading, false, 1000)).toBe(idleLoading)
  })

  it('never shows for an answer quicker than the delay', () => {
    const timeline = play([
      [0, true],
      [120, true],
      [299, true],
      [299, false],
      [1000, false],
    ])
    expect(timeline.some((step) => step.visible)).toBe(false)
  })

  it('shows once the delay is up and work is still pending', () => {
    const timeline = play([
      [0, true],
      [299, true],
      [300, true],
    ])
    expect(timeline.map((step) => step.visible)).toEqual([false, false, true])
  })

  it('stays at least the minimum after work ends', () => {
    const timeline = play([
      [0, true],
      [300, true],
      [350, false],
      [699, false],
      [700, false],
    ])
    expect(timeline.map((step) => step.visible)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ])
  })

  it('hides as soon as work ends when it has already shown long enough', () => {
    const timeline = play([
      [0, true],
      [300, true],
      [2000, true],
      [2000, false],
    ])
    expect(timeline.map((step) => step.visible)).toEqual([
      false,
      true,
      true,
      false,
    ])
  })

  it('stays up without a gap when work starts again during the minimum', () => {
    const timeline = play([
      [0, true],
      [300, true],
      [350, false],
      [500, true],
      [800, true],
      [900, false],
    ])
    expect(timeline.map((step) => step.visible)).toEqual([
      false,
      true,
      true,
      true,
      true,
      false,
    ])
  })

  it('measures the minimum from when it actually showed, if the check comes late', () => {
    const timeline = play([
      [0, true],
      [450, true],
      [500, false],
      [849, false],
      [850, false],
    ])
    expect(timeline.map((step) => step.visible)).toEqual([
      false,
      true,
      true,
      true,
      false,
    ])
  })

  it('restarts the delay for the next piece of work', () => {
    const timeline = play([
      [0, true],
      [100, false],
      [1000, true],
      [1200, true],
      [1300, true],
    ])
    expect(timeline.map((step) => step.visible)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ])
  })

  it('returns the same state when nothing changes', () => {
    const waiting = advanceDelayedLoading(idleLoading, true, 0)
    expect(advanceDelayedLoading(waiting, true, 100)).toBe(waiting)
    const visible = advanceDelayedLoading(waiting, true, 300)
    expect(advanceDelayedLoading(visible, true, 5000)).toBe(visible)
  })

  it('takes other timings', () => {
    const timing = { delayMs: 50, minVisibleMs: 100 }
    let state = advanceDelayedLoading(idleLoading, true, 0, timing)
    state = advanceDelayedLoading(state, true, 50, timing)
    expect(isLoadingVisible(state)).toBe(true)
    state = advanceDelayedLoading(state, false, 60, timing)
    expect(
      isLoadingVisible(advanceDelayedLoading(state, false, 149, timing)),
    ).toBe(true)
    expect(
      isLoadingVisible(advanceDelayedLoading(state, false, 150, timing)),
    ).toBe(false)
  })
})

describe('isLoadingVisible', () => {
  it('is true only while the indicator shows', () => {
    expect(isLoadingVisible(idleLoading)).toBe(false)
    expect(isLoadingVisible({ phase: 'waiting', since: 0 })).toBe(false)
    expect(
      isLoadingVisible({ phase: 'visible', since: 0, pending: false }),
    ).toBe(true)
  })
})

describe('nextLoadingChange', () => {
  it('wakes at the end of the delay, then at the end of the minimum', () => {
    const timeline = play([
      [1000, true],
      [1300, true],
      [1320, false],
    ])
    expect(timeline.map((step) => step.wakeAt)).toEqual([1300, null, 1700])
  })

  it('has nothing to wait for while idle or while visible work is pending', () => {
    expect(nextLoadingChange(idleLoading)).toBeNull()
    expect(
      nextLoadingChange({ phase: 'visible', since: 0, pending: true }),
    ).toBeNull()
  })

  it('uses the timings it is given', () => {
    const timing = { delayMs: 50, minVisibleMs: 100 }
    expect(nextLoadingChange({ phase: 'waiting', since: 10 }, timing)).toBe(60)
    expect(
      nextLoadingChange(
        { phase: 'visible', since: 10, pending: false },
        timing,
      ),
    ).toBe(110)
  })
})
