export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export type Platform = 'mac' | 'other'

export function matchPaletteShortcut(
  event: KeyEventLike,
  platform: Platform,
): boolean {
  const primary = platform === 'mac' ? event.metaKey : event.ctrlKey
  const opposite = platform === 'mac' ? event.ctrlKey : event.metaKey
  if (!primary || opposite) return false
  if (event.shiftKey || event.altKey) return false
  return event.key.toLowerCase() === 'k'
}
