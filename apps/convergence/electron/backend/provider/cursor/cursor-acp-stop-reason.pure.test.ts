import { describe, expect, it } from 'vitest'
import {
  classifyCursorAcpStopReason,
  formatCursorAcpStopReasonNote,
} from './cursor-acp-stop-reason.pure'

describe('classifyCursorAcpStopReason', () => {
  it('classifies end_turn as done', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'end_turn' }).kind).toBe(
      'done',
    )
  })

  it('classifies cancelled as cancelled', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'cancelled' }).kind).toBe(
      'cancelled',
    )
  })

  it('classifies max_tokens as cut-short', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'max_tokens' }).kind).toBe(
      'cut-short',
    )
  })

  it('classifies max_turn_requests as cut-short', () => {
    expect(
      classifyCursorAcpStopReason({ stopReason: 'max_turn_requests' }).kind,
    ).toBe('cut-short')
  })

  it('classifies refusal as refused', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'refusal' }).kind).toBe(
      'refused',
    )
  })

  it('classifies a missing stopReason as unknown (R1 silent case)', () => {
    expect(classifyCursorAcpStopReason({}).kind).toBe('unknown')
  })

  it('classifies a non-string stopReason as unknown', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 42 }).kind).toBe('unknown')
  })

  it('classifies an unrecognised string stopReason as unknown', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'gremlins' }).kind).toBe(
      'unknown',
    )
  })

  it('classifies null result as unknown', () => {
    expect(classifyCursorAcpStopReason(null).kind).toBe('unknown')
  })

  it('classifies undefined result as unknown', () => {
    expect(classifyCursorAcpStopReason(undefined).kind).toBe('unknown')
  })

  it('classifies a non-object result as unknown', () => {
    expect(classifyCursorAcpStopReason(42).kind).toBe('unknown')
  })

  // R1 mutation: mapping undefined back to done must fail.
  it('does NOT treat a missing stopReason as done', () => {
    expect(classifyCursorAcpStopReason({}).kind).not.toBe('done')
  })
})

describe('the word a stopReason prints (MAR-3247 R3)', () => {
  it('prints the wire string itself', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 'gremlins' }).word).toBe(
      'gremlins',
    )
  })

  it('prints none for a missing stopReason', () => {
    expect(classifyCursorAcpStopReason({}).word).toBe('none')
  })

  it('prints none for a null stopReason', () => {
    expect(classifyCursorAcpStopReason({ stopReason: null })).toEqual({
      kind: 'unknown',
      word: 'none',
    })
  })

  it('prints a non-string value as its string', () => {
    expect(classifyCursorAcpStopReason({ stopReason: 42 }).word).toBe('42')
  })
})

describe('formatCursorAcpStopReasonNote', () => {
  const note = (result: unknown) =>
    formatCursorAcpStopReasonNote(classifyCursorAcpStopReason(result))

  it('says none, never null, for { stopReason: null }', () => {
    expect(note({ stopReason: null })).toBe(
      'Cursor ended this turn with an ending Convergence does not know: none.',
    )
  })

  it('names the wire word for a cut-short turn', () => {
    expect(note({ stopReason: 'max_turn_requests' })).toBe(
      'Cursor ended this turn early: max_turn_requests.',
    )
  })

  it('names a refused turn', () => {
    expect(note({ stopReason: 'refusal' })).toBe(
      "Cursor's model refused this turn.",
    )
  })

  it('writes no note for done or cancelled', () => {
    expect(note({ stopReason: 'end_turn' })).toBeNull()
    expect(note({ stopReason: 'cancelled' })).toBeNull()
  })
})
