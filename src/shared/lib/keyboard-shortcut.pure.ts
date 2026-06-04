export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export type Platform = 'mac' | 'other'

export interface KeyboardShortcutBinding {
  key: string
  shiftKey: boolean
  altKey: boolean
}

export const DEFAULT_COMMAND_CENTER_SHORTCUT: KeyboardShortcutBinding = {
  key: 'k',
  shiftKey: false,
  altKey: false,
}

const ALLOWED_KEY_PATTERN = /^[a-z0-9]$/

interface ReservedShortcut {
  binding: KeyboardShortcutBinding
  label: string
}

const RESERVED_SHORTCUTS: ReservedShortcut[] = [
  {
    binding: { key: 'j', shiftKey: false, altKey: false },
    label: 'Conversation dock',
  },
  {
    binding: { key: 't', shiftKey: false, altKey: false },
    label: 'Terminal new tab',
  },
  {
    binding: { key: 'd', shiftKey: false, altKey: false },
    label: 'Terminal split',
  },
  {
    binding: { key: 'd', shiftKey: true, altKey: false },
    label: 'Terminal split horizontal',
  },
  {
    binding: { key: 'w', shiftKey: false, altKey: false },
    label: 'Terminal close tab',
  },
  {
    binding: { key: '[', shiftKey: true, altKey: false },
    label: 'Terminal previous tab',
  },
  {
    binding: { key: ']', shiftKey: true, altKey: false },
    label: 'Terminal next tab',
  },
  {
    binding: { key: '`', shiftKey: false, altKey: false },
    label: 'Terminal dock',
  },
  {
    binding: { key: 'arrowleft', shiftKey: false, altKey: true },
    label: 'Terminal focus left',
  },
  {
    binding: { key: 'arrowright', shiftKey: false, altKey: true },
    label: 'Terminal focus right',
  },
  {
    binding: { key: 'arrowup', shiftKey: false, altKey: true },
    label: 'Terminal focus up',
  },
  {
    binding: { key: 'arrowdown', shiftKey: false, altKey: true },
    label: 'Terminal focus down',
  },
]

function normalizeBindingKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase()
}

function bindingsEqual(
  a: KeyboardShortcutBinding,
  b: KeyboardShortcutBinding,
): boolean {
  return (
    normalizeBindingKey(a.key) === normalizeBindingKey(b.key) &&
    a.shiftKey === b.shiftKey &&
    a.altKey === b.altKey
  )
}

export function matchKeyboardShortcut(
  event: KeyEventLike,
  platform: Platform,
  binding: KeyboardShortcutBinding,
): boolean {
  const primary = platform === 'mac' ? event.metaKey : event.ctrlKey
  const opposite = platform === 'mac' ? event.ctrlKey : event.metaKey
  if (!primary || opposite) return false
  if (event.shiftKey !== binding.shiftKey) return false
  if (event.altKey !== binding.altKey) return false
  return normalizeBindingKey(event.key) === normalizeBindingKey(binding.key)
}

export function matchPaletteShortcut(
  event: KeyEventLike,
  platform: Platform,
): boolean {
  return matchKeyboardShortcut(event, platform, DEFAULT_COMMAND_CENTER_SHORTCUT)
}

export function formatShortcutLabel(
  binding: KeyboardShortcutBinding,
  platform: Platform,
): string {
  const primary = platform === 'mac' ? '⌘' : 'Ctrl'
  const parts = [primary]
  if (binding.shiftKey) parts.push(platform === 'mac' ? '⇧' : 'Shift')
  if (binding.altKey) parts.push(platform === 'mac' ? '⌥' : 'Alt')
  const keyLabel =
    binding.key.length === 1 ? binding.key.toUpperCase() : binding.key
  parts.push(keyLabel)
  return platform === 'mac' ? parts.join('') : parts.join('+')
}

export function parseCommandCenterShortcut(
  value: unknown,
): KeyboardShortcutBinding {
  if (!value || typeof value !== 'object') {
    return DEFAULT_COMMAND_CENTER_SHORTCUT
  }
  const raw = value as Partial<KeyboardShortcutBinding>
  const key =
    typeof raw.key === 'string' && raw.key.length > 0
      ? normalizeBindingKey(raw.key)
      : DEFAULT_COMMAND_CENTER_SHORTCUT.key
  return {
    key,
    shiftKey: raw.shiftKey === true,
    altKey: raw.altKey === true,
  }
}

export function validateCommandCenterShortcut(
  binding: KeyboardShortcutBinding,
): KeyboardShortcutBinding | null {
  const key = normalizeBindingKey(binding.key)
  if (!ALLOWED_KEY_PATTERN.test(key)) return null
  return {
    key,
    shiftKey: binding.shiftKey,
    altKey: binding.altKey,
  }
}

export function findShortcutConflict(
  binding: KeyboardShortcutBinding,
): string | null {
  const validated = validateCommandCenterShortcut(binding)
  if (!validated) {
    return 'Use a single letter or number key with the primary modifier.'
  }

  for (const reserved of RESERVED_SHORTCUTS) {
    if (bindingsEqual(validated, reserved.binding)) {
      return `Already used by ${reserved.label}.`
    }
  }

  return null
}

export function bindingFromKeyEvent(
  event: KeyEventLike,
): KeyboardShortcutBinding | null {
  const key = normalizeBindingKey(event.key)
  if (!ALLOWED_KEY_PATTERN.test(key)) return null
  return {
    key,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
  }
}
