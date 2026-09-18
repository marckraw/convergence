import {
  parseWavePanelWidth,
  serializeWavePanelWidth,
} from './wave-panel-width.pure'
import { WAVE_PANEL_DEFAULT_COLUMN_WIDTH } from './wave-sections.pure'

const STORAGE_KEY = 'convergence-wave-panel-width'

/** The column's width between runs; a view preference only (MAR-3155 R3). */
export function loadWavePanelWidth(): number {
  try {
    return parseWavePanelWidth(localStorage.getItem(STORAGE_KEY))
  } catch {
    return WAVE_PANEL_DEFAULT_COLUMN_WIDTH
  }
}

export function saveWavePanelWidth(width: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeWavePanelWidth(width))
  } catch {
    // localStorage not available; the column starts at its default next time.
  }
}
