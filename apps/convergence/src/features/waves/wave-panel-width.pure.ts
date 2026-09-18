import {
  clampWavePanelWidth,
  WAVE_PANEL_DEFAULT_COLUMN_WIDTH,
  WAVE_PANEL_MAX_COLUMN_WIDTH,
} from './wave-sections.pure'

/**
 * The column's width between runs (MAR-3155 R3).
 *
 * Its own pair beside the mode's, for the mode's reason: storage outlives
 * code. A value this build cannot read -- an older format, a hand-edited
 * entry, a half-written string -- reads as the default, so one bad line in
 * the browser store can never leave the person without a column.
 */
export function parseWavePanelWidth(raw: string | null): number {
  if (raw === null) return WAVE_PANEL_DEFAULT_COLUMN_WIDTH
  const trimmed = raw.trim()
  // `Number('')` is 0 and `Number(' ')` is 0: an empty entry is not a width,
  // and read as one it would clamp to the floor instead of the default.
  if (trimmed === '') return WAVE_PANEL_DEFAULT_COLUMN_WIDTH
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return WAVE_PANEL_DEFAULT_COLUMN_WIDTH
  // A width outside the range is still a choice somebody made -- honoured as
  // far as the range allows, rather than thrown away for the default.
  return clampWavePanelWidth(value, WAVE_PANEL_MAX_COLUMN_WIDTH)
}

export function serializeWavePanelWidth(width: number): string {
  return String(Math.round(width))
}
