import { describe, expect, it } from 'vitest'
import {
  deriveLiveness,
  LIVENESS_QUIET_MS,
  LIVENESS_SILENT_MS,
} from './liveness.pure'

describe('deriveLiveness', () => {
  it('returns fresh with zero elapsed when lastEventAt is null', () => {
    const signal = deriveLiveness({ lastEventAt: null, now: 1_000_000 })
    expect(signal).toEqual({ kind: 'fresh', msSinceLastEvent: 0 })
  })

  it('returns fresh below the quiet threshold', () => {
    const now = 1_000_000
    const lastEventAt = now - (LIVENESS_QUIET_MS - 1)
    const signal = deriveLiveness({ lastEventAt, now })
    expect(signal.kind).toBe('fresh')
  })

  it('returns quiet at the quiet threshold exactly', () => {
    const now = 1_000_000
    const lastEventAt = now - LIVENESS_QUIET_MS
    const signal = deriveLiveness({ lastEventAt, now })
    expect(signal).toEqual({
      kind: 'quiet',
      msSinceLastEvent: LIVENESS_QUIET_MS,
    })
  })

  it('returns silent at the silent threshold exactly', () => {
    const now = 1_000_000
    const lastEventAt = now - LIVENESS_SILENT_MS
    const signal = deriveLiveness({ lastEventAt, now })
    expect(signal).toEqual({
      kind: 'silent',
      msSinceLastEvent: LIVENESS_SILENT_MS,
    })
  })

  it('clamps negative elapsed values to zero (clock skew safety)', () => {
    const signal = deriveLiveness({ lastEventAt: 2_000, now: 1_000 })
    expect(signal).toEqual({ kind: 'fresh', msSinceLastEvent: 0 })
  })
})
