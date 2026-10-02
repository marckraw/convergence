import { isLoomSearchShortcut } from './loom-search.pure'

/**
 * A keydown as Loom reads it: the key, where it landed, its modifiers, and
 * the two ways of answering it. A React `KeyboardEvent` is one.
 */
export interface LoomKeyEvent {
  key: string
  target: unknown
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  preventDefault: () => void
  stopPropagation: () => void
}

/** Where each of Loom's two shapes sends the keys it answers. */
export interface LoomKeyDoors {
  /** `/` inside Loom, outside any text input: focus search (MAR-3234 R6). */
  onShortcut: () => void
  /**
   * Escape, when this shape has something for it to do (MAR-3195 R5).
   * Absent, Escape is not Loom's to answer, and it goes on past Loom.
   */
  onEscape?: () => void
}

/**
 * Loom's keys, one rule for both of its shapes (MC-35): the `/` that focuses
 * search, and Escape.
 *
 * The `/` is kept from typing itself (`preventDefault`), so it does not land
 * in the field it just focused. Escape stops at Loom when Loom answers it
 * (`stopPropagation`), and is left alone when it does not.
 *
 * The event and the doors are handed in, so the rule is tested without a DOM.
 */
export function answerLoomKey(event: LoomKeyEvent, doors: LoomKeyDoors): void {
  if (isLoomSearchShortcut(event)) {
    event.preventDefault()
    doors.onShortcut()
    return
  }
  if (event.key === 'Escape' && doors.onEscape) {
    event.stopPropagation()
    doors.onEscape()
  }
}
