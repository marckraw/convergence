import {
  parseReviewNoteMode,
  parseReviewNoteState,
  type ReviewNoteMode,
  type ReviewNoteState,
} from './review-notes.types'

export function normalizeReviewNoteRequiredText(
  value: string,
  label: string,
): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`${label} cannot be empty`)
  }
  return trimmed
}

export function normalizeReviewNoteOptionalText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function normalizeReviewNoteLine(
  value: number | null | undefined,
): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Review note line numbers must be positive integers')
  }
  return value
}

export function normalizeReviewNoteMode(mode: ReviewNoteMode): ReviewNoteMode {
  return parseReviewNoteMode(mode)
}

export function normalizeReviewNoteState(
  state: ReviewNoteState,
): ReviewNoteState {
  return parseReviewNoteState(state)
}
