import { describe, expect, it } from 'vitest'
import { meterFraction, meterTone } from './meter.pure'

describe('meterTone', () => {
  it('wears the tone it is given, whatever the thresholds say', () => {
    expect(
      meterTone({
        value: 99,
        tone: 'neutral',
        thresholds: { warning: 50, danger: 90 },
      }),
    ).toBe('neutral')
  })

  it('is info when nothing says otherwise', () => {
    expect(meterTone({ value: 40 })).toBe('info')
  })

  it('turns worse as it fills, when more is worse', () => {
    const thresholds = { warning: 75, danger: 90 }
    expect(meterTone({ value: 40, thresholds })).toBe('success')
    expect(meterTone({ value: 75, thresholds })).toBe('warning')
    expect(meterTone({ value: 90, thresholds })).toBe('danger')
  })

  it('turns worse as it empties, when less is worse', () => {
    const thresholds = { warning: 25, danger: 10 }
    expect(meterTone({ value: 60, thresholds })).toBe('success')
    expect(meterTone({ value: 25, thresholds })).toBe('warning')
    expect(meterTone({ value: 4, thresholds })).toBe('danger')
  })
})

describe('meterFraction', () => {
  it('is how full the range is, clamped to it', () => {
    expect(meterFraction(50, 0, 200)).toBe(0.25)
    expect(meterFraction(-5, 0, 100)).toBe(0)
    expect(meterFraction(150, 0, 100)).toBe(1)
    expect(meterFraction(3, 3, 3)).toBe(0)
  })
})
