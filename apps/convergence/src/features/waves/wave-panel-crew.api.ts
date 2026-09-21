import { parseLoomFollow, serializeLoomFollow } from './loom-follow.pure'
import { parseLoomCrew, serializeLoomCrew } from './wave-panel-crew.pure'

const STORAGE_KEY = 'convergence-loom-crew'
const FOLLOW_KEY = 'convergence-loom-follow'

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

/**
 * Whether Loom follows the open conversation (MAR-3291 R3), between runs.
 *
 * A view preference beside the crew it chooses, in the same file for the same
 * reason: both are answers to "which crew is Loom showing", one remembered as
 * a choice and one as a way of choosing.
 */
export function loadLoomFollow(): boolean {
  try {
    return parseLoomFollow(localStorage.getItem(FOLLOW_KEY))
  } catch {
    return false
  }
}

/** On is a written value; off is the absence of the key, never `'0'`. */
export function saveLoomFollow(on: boolean): void {
  try {
    if (on) localStorage.setItem(FOLLOW_KEY, serializeLoomFollow())
    else localStorage.removeItem(FOLLOW_KEY)
  } catch {
    // localStorage not available; Loom does not follow, and does not remember.
  }
}
