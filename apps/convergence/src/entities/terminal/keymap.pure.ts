import {
  formatShortcutLabel,
  type KeyboardShortcutBinding,
} from '@/shared/lib/keyboard-shortcut.pure'

export type TerminalShortcut =
  | { kind: 'new-tab' }
  | { kind: 'split'; direction: 'horizontal' | 'vertical' }
  | { kind: 'close-tab' }
  | { kind: 'cycle-tab'; direction: 'prev' | 'next' }
  | { kind: 'focus-adjacent'; direction: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'clear' }
  | { kind: 'toggle-dock' }
  | { kind: 'cycle-dock-placement' }

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
  if (key === 't' && shiftKey) return { kind: 'cycle-dock-placement' }
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

/** A shortcut the pane's buttons name: new tab, the two splits, close. */
export type TerminalButtonShortcut =
  | 'new-tab'
  | 'split-vertical'
  | 'split-horizontal'
  | 'close-tab'

/**
 * The keys `matchShortcut` answers to for the pane's buttons, as bindings, so
 * a button can say its key (NAV-23). A test runs each one back through
 * `matchShortcut`, so the words and the keymap can't drift apart.
 */
export const TERMINAL_BUTTON_BINDINGS: Record<
  TerminalButtonShortcut,
  KeyboardShortcutBinding
> = {
  'new-tab': { key: 't', shiftKey: false, altKey: false },
  'split-vertical': { key: 'd', shiftKey: false, altKey: false },
  'split-horizontal': { key: 'd', shiftKey: true, altKey: false },
  'close-tab': { key: 'w', shiftKey: false, altKey: false },
}

/** Each button's key in words for this platform: "⌘T", "Ctrl+Shift+D". */
export type TerminalShortcutLabels = Record<TerminalButtonShortcut, string>

export function terminalShortcutLabels(
  platform: Platform,
): TerminalShortcutLabels {
  return {
    'new-tab': formatShortcutLabel(
      TERMINAL_BUTTON_BINDINGS['new-tab'],
      platform,
    ),
    'split-vertical': formatShortcutLabel(
      TERMINAL_BUTTON_BINDINGS['split-vertical'],
      platform,
    ),
    'split-horizontal': formatShortcutLabel(
      TERMINAL_BUTTON_BINDINGS['split-horizontal'],
      platform,
    ),
    'close-tab': formatShortcutLabel(
      TERMINAL_BUTTON_BINDINGS['close-tab'],
      platform,
    ),
  }
}
