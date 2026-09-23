import { describe, expect, it } from 'vitest'
import {
  CURSOR_DEAD_TURN_PREFIX,
  formatCursorDeadTurnNote,
  isDeadTurnText,
} from './cursor-dead-turn.pure'

/** The three dead turns on the record (MAR-3159, MAR-3298 laps 1 and 2). */
const SAMPLES = [
  'Error: T: WritableIterable is closed',
  'Error: RetriableError: [canceled] http/2 stream closed with error code CANCEL (0x8)',
  'Error: RetriableError: [canceled] http/2 stream closed with error code CANCEL (0x8)\n',
] as const

describe('isDeadTurnText (MAR-3302 R1)', () => {
  it.each(SAMPLES)('reads the recorded line %j as a dead turn', (sample) => {
    expect(isDeadTurnText(sample)).toBe(true)
  })

  it('reads a reply that opens with "Error:" and goes on as a reply', () => {
    expect(isDeadTurnText('Error: something\nmore text')).toBe(false)
  })

  it('does not match "Error:" anywhere but the start of the text', () => {
    // Mutation: `includes('Error')` instead of the prefix -> red here.
    expect(isDeadTurnText('I saw an Error: in the log')).toBe(false)
  })

  it('reads nothing as nothing', () => {
    expect(isDeadTurnText('')).toBe(false)
    expect(isDeadTurnText('   \n ')).toBe(false)
  })

  it('needs the prefix whole, space included', () => {
    expect(CURSOR_DEAD_TURN_PREFIX).toBe('Error: ')
    expect(isDeadTurnText('Error:')).toBe(false)
    expect(isDeadTurnText('Errors: two of them')).toBe(false)
  })
})

describe('formatCursorDeadTurnNote (MAR-3302 R2)', () => {
  it('names the death and carries the line trimmed', () => {
    expect(formatCursorDeadTurnNote(`${SAMPLES[0]}\n`)).toBe(
      "Cursor's turn died: Error: T: WritableIterable is closed",
    )
  })
})
