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

/** ⌘↵ (Ctrl+Enter off the Mac): a form's submit from any of its fields, and the composer's send. */
export const SUBMIT_SHORTCUT: KeyboardShortcutBinding = {
  key: 'enter',
  shiftKey: false,
  altKey: false,
}

/** ⌘J (Ctrl+J off the Mac): a terminal session's conversation dock, shown and hidden. */
export const CONVERSATION_DOCK_SHORTCUT: KeyboardShortcutBinding = {
  key: 'j',
  shiftKey: false,
  altKey: false,
}

/** ⌘. (Ctrl+. off the Mac): a conversation's Actions. */
export const ACTIONS_SHORTCUT: KeyboardShortcutBinding = {
  key: '.',
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
    binding: { key: 'f', shiftKey: false, altKey: false },
    label: 'Sidebar search',
  },
  {
    binding: CONVERSATION_DOCK_SHORTCUT,
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
  return key.toLowerCase()
}

export function hasPrimaryModifier(event: KeyEventLike): boolean {
  return event.metaKey || event.ctrlKey
}

export function shortcutPlatformFromOs(osPlatform: string | null): Platform {
  return osPlatform === 'darwin' ? 'mac' : 'other'
}

export function detectShortcutPlatform(navigatorPlatform?: string): Platform {
  if (!navigatorPlatform) return 'other'
  return navigatorPlatform.toLowerCase().includes('mac') ? 'mac' : 'other'
}

/** The platform this page runs on, from the browser's own word; 'other' with no browser (Node). */
export function runningShortcutPlatform(): Platform {
  return detectShortcutPlatform(
    typeof navigator === 'undefined' ? undefined : navigator.platform,
  )
}

export type ShortcutRecordingResult =
  | { kind: 'cancel' }
  | { kind: 'ignore' }
  | { kind: 'invalid-key' }
  | { kind: 'conflict'; message: string }
  | { kind: 'captured'; binding: KeyboardShortcutBinding }

export function resolveShortcutRecording(
  event: KeyEventLike,
): ShortcutRecordingResult {
  if (event.key === 'Escape') return { kind: 'cancel' }
  if (!hasPrimaryModifier(event)) return { kind: 'ignore' }

  const captured = bindingFromKeyEvent(event)
  if (!captured) return { kind: 'invalid-key' }

  const conflict = findShortcutConflict(captured)
  if (conflict) return { kind: 'conflict', message: conflict }

  return { kind: 'captured', binding: captured }
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

/** The keys with a name, as each platform writes them: the Mac its glyphs, elsewhere words. */
const NAMED_KEYS: Record<string, { mac: string; other: string }> = {
  enter: { mac: '↵', other: 'Enter' },
  escape: { mac: 'Esc', other: 'Esc' },
  arrowleft: { mac: '←', other: '←' },
  arrowright: { mac: '→', other: '→' },
  arrowup: { mac: '↑', other: '↑' },
  arrowdown: { mac: '↓', other: '↓' },
}

export function formatShortcutLabel(
  binding: KeyboardShortcutBinding,
  platform: Platform,
): string {
  const primary = platform === 'mac' ? '⌘' : 'Ctrl'
  const parts = [primary]
  if (binding.shiftKey) parts.push(platform === 'mac' ? '⇧' : 'Shift')
  if (binding.altKey) parts.push(platform === 'mac' ? '⌥' : 'Alt')
  const named = NAMED_KEYS[normalizeBindingKey(binding.key)]
  const keyLabel = named
    ? named[platform]
    : binding.key.length === 1
      ? binding.key.toUpperCase()
      : binding.key
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
