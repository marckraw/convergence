export type TerminalShortcut =
  | { kind: 'new-tab' }
  | { kind: 'split'; direction: 'horizontal' | 'vertical' }
  | { kind: 'close-tab' }
  | { kind: 'cycle-tab'; direction: 'prev' | 'next' }
  | { kind: 'focus-adjacent'; direction: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'clear' }
  | { kind: 'toggle-dock' }

export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export type Platform = 'mac' | 'other'

export function matchShortcut(
  event: KeyEventLike,
  platform: Platform,
): TerminalShortcut | null {
  const primary = platform === 'mac' ? event.metaKey : event.ctrlKey
  const opposite = platform === 'mac' ? event.ctrlKey : event.metaKey
  if (!primary || opposite) return null

  const key = event.key.toLowerCase()
  const { shiftKey, altKey } = event

  if (key === 'arrowleft' && altKey && !shiftKey) {
    return { kind: 'focus-adjacent', direction: 'left' }
  }
  if (key === 'arrowright' && altKey && !shiftKey) {
    return { kind: 'focus-adjacent', direction: 'right' }
  }
  if (key === 'arrowup' && altKey && !shiftKey) {
    return { kind: 'focus-adjacent', direction: 'up' }
  }
  if (key === 'arrowdown' && altKey && !shiftKey) {
    return { kind: 'focus-adjacent', direction: 'down' }
  }

  if (altKey) return null

  if (key === 't' && !shiftKey) return { kind: 'new-tab' }
  if (key === 'd' && !shiftKey) {
    return { kind: 'split', direction: 'vertical' }
  }
  if (key === 'd' && shiftKey) {
    return { kind: 'split', direction: 'horizontal' }
  }
  if (key === 'w' && !shiftKey) return { kind: 'close-tab' }
  if (key === '[' && shiftKey) {
    return { kind: 'cycle-tab', direction: 'prev' }
  }
  if (key === ']' && shiftKey) {
    return { kind: 'cycle-tab', direction: 'next' }
  }
  if (key === 'k' && !shiftKey) return { kind: 'clear' }
  if (key === '`' && !shiftKey) return { kind: 'toggle-dock' }

  return null
}
