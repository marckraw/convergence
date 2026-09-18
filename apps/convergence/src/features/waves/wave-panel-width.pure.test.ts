import { describe, expect, it } from 'vitest'
import {
  parseWavePanelWidth,
  serializeWavePanelWidth,
} from './wave-panel-width.pure'
import {
  WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
  WAVE_PANEL_MAX_COLUMN_WIDTH,
  WAVE_PANEL_MIN_COLUMN_WIDTH,
} from './wave-sections.pure'

/**
 * The stored width, read the way storage has to be read (MAR-3155 R3):
 * anything this build cannot make sense of leaves the column at its default
 * rather than at nothing.
 */
describe('MAR-3155 R3: a width from storage', () => {
  it.each([
    ['a width inside the range', '360', 360],
    ['the floor itself', '280', WAVE_PANEL_MIN_COLUMN_WIDTH],
    ['the ceiling itself', '400', WAVE_PANEL_MAX_COLUMN_WIDTH],
    // MAR-3189 R4: a width stored under the old 240-640 law loads inside the
    // new one. Mutation: parse without the clamp -> 640 here, red.
    ['a width from before the Loom bounds', '640', 400],
    ['below the old floor', '100', WAVE_PANEL_MIN_COLUMN_WIDTH],
    ['above the ceiling', '5000', WAVE_PANEL_MAX_COLUMN_WIDTH],
    ['a fraction', '360.5', 360.5],
    ['padded', '  360  ', 360],
  ])('%s -> %s', (_case, raw, expected) => {
    expect(parseWavePanelWidth(raw)).toBe(expected)
  })

  it.each([
    ['nothing stored', null],
    ['a word', 'wide'],
    ['not a number', 'NaN'],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['infinity', 'Infinity'],
    ['an object', '{"width":360}'],
  ])('%s -> the default', (_case, raw) => {
    // Mutation: `Number(raw)` with no guard -> 'wide' reads NaN, '' reads 0,
    // and the column comes back at its floor or at nothing.
    expect(parseWavePanelWidth(raw)).toBe(WAVE_PANEL_DEFAULT_COLUMN_WIDTH)
  })

  it('round-trips what it writes', () => {
    for (const width of [
      WAVE_PANEL_MIN_COLUMN_WIDTH,
      WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
      321,
      WAVE_PANEL_MAX_COLUMN_WIDTH,
    ]) {
      expect(parseWavePanelWidth(serializeWavePanelWidth(width))).toBe(width)
    }
    // Mutation: serialize the raw float -> storage grows `423.7000000001`
    // shapes over time; the round trip above still passes, so this is the
    // case that says a written width is a whole pixel.
    expect(serializeWavePanelWidth(423.7)).toBe('424')
  })
})
