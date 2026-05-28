import { describe, expect, it } from 'vitest'
import {
  normalizeReviewNoteLine,
  normalizeReviewNoteMode,
  normalizeReviewNoteOptionalText,
  normalizeReviewNoteRequiredText,
  normalizeReviewNoteState,
} from './review-notes.pure'

describe('review note normalizers', () => {
  it('trims required text and rejects blanks', () => {
    expect(normalizeReviewNoteRequiredText('  src/app.ts  ', 'File')).toBe(
      'src/app.ts',
    )
    expect(() => normalizeReviewNoteRequiredText('   ', 'File')).toThrow(
      'File cannot be empty',
    )
  })

  it('normalizes optional text to trimmed text or null', () => {
    expect(normalizeReviewNoteOptionalText(undefined)).toBeNull()
    expect(normalizeReviewNoteOptionalText(null)).toBeNull()
    expect(normalizeReviewNoteOptionalText('   ')).toBeNull()
    expect(normalizeReviewNoteOptionalText('  @@ hunk  ')).toBe('@@ hunk')
  })

  it('accepts positive integer lines only', () => {
    expect(normalizeReviewNoteLine(undefined)).toBeNull()
    expect(normalizeReviewNoteLine(null)).toBeNull()
    expect(normalizeReviewNoteLine(12)).toBe(12)
    expect(() => normalizeReviewNoteLine(0)).toThrow(
      'Review note line numbers must be positive integers',
    )
    expect(() => normalizeReviewNoteLine(1.2)).toThrow(
      'Review note line numbers must be positive integers',
    )
  })

  it('passes valid mode and state through their parsers', () => {
    expect(normalizeReviewNoteMode('working-tree')).toBe('working-tree')
    expect(normalizeReviewNoteState('draft')).toBe('draft')
    expect(normalizeReviewNoteState('sent')).toBe('sent')
  })
})
