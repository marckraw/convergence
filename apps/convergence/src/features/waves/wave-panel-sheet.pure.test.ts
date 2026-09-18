import { expect, it } from 'vitest'
import {
  DEFAULT_LOOM_SHEET,
  LOOM_SHEETS,
  LOOM_SHEET_NAMES,
  parseLoomSheet,
  serializeLoomSheet,
  type LoomSheet,
} from './wave-panel-sheet.pure'

it('MAR-3189 R3: every sheet round-trips; anything unknown reads as Now', () => {
  for (const sheet of LOOM_SHEETS) {
    expect(parseLoomSheet(serializeLoomSheet(sheet))).toBe(sheet)
  }
  // Mutation: default to `before` -> red. A stored value this build cannot
  // read must still leave a sheet open, and the useful one is what is on now.
  expect(parseLoomSheet('sideways')).toBe(DEFAULT_LOOM_SHEET)
  expect(parseLoomSheet(null)).toBe(DEFAULT_LOOM_SHEET)
  expect(parseLoomSheet('')).toBe(DEFAULT_LOOM_SHEET)
  expect(DEFAULT_LOOM_SHEET).toBe('now')
})

it('MAR-3189 R1: the four sheets are named, in reading order', () => {
  // Mutation: drop one sheet from the list -> red here and in the stack,
  // which draws its titles from this very array.
  expect([...LOOM_SHEETS]).toEqual(['before', 'now', 'next', 'plan'])
  expect(
    LOOM_SHEETS.map((sheet: LoomSheet) => LOOM_SHEET_NAMES[sheet]),
  ).toEqual(['Before', 'Now', 'Next', 'Plan'])
})
