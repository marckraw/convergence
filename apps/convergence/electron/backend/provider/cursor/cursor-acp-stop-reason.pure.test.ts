import { describe, expect, it } from 'vitest'
import { classifyCursorAcpStopReason } from './cursor-acp-stop-reason.pure'

describe('classifyCursorAcpStopReason', () => {
  it('classifies end_turn as done', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'end_turn' })).toBe('done')
  })

  it('classifies cancelled as cancelled', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'cancelled' })).toBe(
      'cancelled',
    )
  })

  it('classifies max_tokens as cut-short', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'max_tokens' })).toBe(
      'cut-short',
    )
  })

  it('classifies max_turn_requests as cut-short', () => {
    expect(
      classifyCursorAcpStopReason({ stopReason: 'max_turn_requests' }),
    ).toBe('cut-short')
  })

  it('classifies refusal as refused', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'refusal' })).toBe(
      'refused',
    )
  })

  it('classifies a missing stopReason as unknown (R1 silent case)', () => {
    expect(classifyCursorAcpStopReason({})).toBe('unknown')
  })

  it('classifies a non-string stopReason as unknown', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 42 })).toBe('unknown')
  })

  it('classifies an unrecognised string stopReason as unknown', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'gremlins' })).toBe(
      'unknown',
    )
  })

  it('classifies null result as unknown', () => {
    expect(classifyCursorAcpStopReason(null)).toBe('unknown')
  })

  it('classifies undefined result as unknown', () => {
    expect(classifyCursorAcpStopReason(undefined)).toBe('unknown')
  })

  it('classifies a non-object result as unknown', () => {
    expect(classifyCursorAcpStopReason(42)).toBe('unknown')
  })

  // R1 mutation: mapping undefined back to done must fail.
  it('does NOT treat a missing stopReason as done', () => {
    expect(classifyCursorAcpStopReason({})).not.toBe('done')
  })
})
