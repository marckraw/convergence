import { parseLoomCrew, serializeLoomCrew } from './wave-panel-crew.pure'

const STORAGE_KEY = 'convergence-loom-crew'

/**
 * The crew Loom showed last, between runs; a view preference only
 * (MAR-3225 R4). Which crew that id still names is resolved against the
 * bound crews at read time, never here.
 */
export function loadLoomCrew(): string | null {
  try {
    return parseLoomCrew(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveLoomCrew(crewId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeLoomCrew(crewId))
  } catch {
    // localStorage not available; Loom opens on the first bound crew.
  }
}
