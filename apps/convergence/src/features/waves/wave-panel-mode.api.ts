import {
  parseWavePanelMode,
  serializeWavePanelMode,
  type WavePanelMode,
} from './wave-panel-mode.pure'

const STORAGE_KEY = 'convergence-wave-panel-mode'

/** The column's compact/expanded/folded choice between runs; a view preference only. */
export function loadWavePanelMode(): WavePanelMode {
  try {
    return parseWavePanelMode(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'compact'
  }
}

export function saveWavePanelMode(mode: WavePanelMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeWavePanelMode(mode))
  } catch {
    // localStorage not available; the column starts compact next time.
  }
}
