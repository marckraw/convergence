/**
 * Which of Loom's four sheets is open (MAR-3189 R1).
 *
 * The order is the reading order -- what was, what is, what is queued, what
 * is still being shaped -- and it is the order the stack draws in, compact
 * and expanded alike.
 */
export type LoomSheet = 'before' | 'now' | 'next' | 'plan'

export const LOOM_SHEETS: readonly LoomSheet[] = [
  'before',
  'now',
  'next',
  'plan',
]

/** The sheet a person lands on when nothing has been chosen: what is on now. */
export const DEFAULT_LOOM_SHEET: LoomSheet = 'now'

/** The sheet's own word, as the stack's title and its accessible name start. */
export const LOOM_SHEET_NAMES: Readonly<Record<LoomSheet, string>> = {
  before: 'Before',
  now: 'Now',
  next: 'Next',
  plan: 'Plan',
}

/**
 * Reads a stored sheet, by the mode's law (MAR-3189 R3): storage outlives
 * code, so anything this build does not know reads as `now` rather than
 * leaving the panel with no sheet open at all.
 */
export function parseLoomSheet(raw: string | null): LoomSheet {
  return LOOM_SHEETS.includes(raw as LoomSheet)
    ? (raw as LoomSheet)
    : DEFAULT_LOOM_SHEET
}

export function serializeLoomSheet(sheet: LoomSheet): string {
  return sheet
}
