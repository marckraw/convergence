import {
  DEFAULT_LOOM_SHEET,
  parseLoomSheet,
  serializeLoomSheet,
  type LoomSheet,
} from './wave-panel-sheet.pure'

const STORAGE_KEY = 'convergence-loom-sheet'

/** The open sheet between runs; a view preference only (MAR-3189 R3). */
export function loadLoomSheet(): LoomSheet {
  try {
    return parseLoomSheet(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_LOOM_SHEET
  }
}

export function saveLoomSheet(sheet: LoomSheet): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeLoomSheet(sheet))
  } catch {
    // localStorage not available; Loom opens on Now next time.
  }
}
