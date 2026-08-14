import {
  DEFAULT_MISSION_CONTROL_VIEW,
  parseMissionControlView,
  serializeMissionControlView,
} from './mission-control-view.pure'
import type { StoredMissionControlView } from './mission-control-view.pure'

const STORAGE_KEY = 'convergence-mission-control-view'

/**
 * Where the room's shape is kept between runs.
 *
 * Renderer-side on purpose: this is a view preference, not app state, and MC4
 * is renderer-only. localStorage is per-origin, so the dev app and the packaged
 * app each remember their own shape — acceptable, and quietly useful.
 */
export function loadMissionControlView(): StoredMissionControlView {
  try {
    return parseMissionControlView(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_MISSION_CONTROL_VIEW
  }
}

export function saveMissionControlView(view: StoredMissionControlView): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeMissionControlView(view))
  } catch {
    // localStorage not available; the room simply starts fresh next time.
  }
}
