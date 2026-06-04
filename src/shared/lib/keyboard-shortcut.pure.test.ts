import { describe, expect, it } from 'vitest'
import {
  bindingFromKeyEvent,
  DEFAULT_COMMAND_CENTER_SHORTCUT,
  findShortcutConflict,
  formatShortcutLabel,
  matchKeyboardShortcut,
  matchPaletteShortcut,
  parseCommandCenterShortcut,
  validateCommandCenterShortcut,
  type KeyEventLike,
} from './keyboard-shortcut.pure'

function ev(
  key: string,
  mods: Partial<
    Pick<KeyEventLike, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>
  > = {},
): KeyEventLike {
  return {
    key,
    metaKey: mods.metaKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
    shiftKey: mods.shiftKey ?? false,
    altKey: mods.altKey ?? false,
  }
}

const mac = 'mac' as const
const other = 'other' as const

describe('matchPaletteShortcut', () => {
  it('matches bare Cmd+K on mac', () => {
    expect(matchPaletteShortcut(ev('k', { metaKey: true }), mac)).toBe(true)
  })

  it('matches Ctrl+K on other platforms', () => {
    expect(matchPaletteShortcut(ev('k', { ctrlKey: true }), other)).toBe(true)
  })

  it('rejects wrong modifier on mac', () => {
    expect(matchPaletteShortcut(ev('k', { ctrlKey: true }), mac)).toBe(false)
  })
})

describe('matchKeyboardShortcut', () => {
  it('matches a custom binding', () => {
    const binding = { key: 'p', shiftKey: true, altKey: false }
    expect(
      matchKeyboardShortcut(
        ev('P', { metaKey: true, shiftKey: true }),
        mac,
        binding,
      ),
    ).toBe(true)
  })

  it('rejects when shift does not match', () => {
    expect(
      matchKeyboardShortcut(ev('p', { metaKey: true }), mac, {
        key: 'p',
        shiftKey: true,
        altKey: false,
      }),
    ).toBe(false)
  })
})

describe('formatShortcutLabel', () => {
  it('formats mac default', () => {
    expect(formatShortcutLabel(DEFAULT_COMMAND_CENTER_SHORTCUT, mac)).toBe('⌘K')
  })

  it('formats windows-style shift binding', () => {
    expect(
      formatShortcutLabel({ key: 'p', shiftKey: true, altKey: false }, other),
    ).toBe('Ctrl+Shift+P')
  })
})

describe('parseCommandCenterShortcut', () => {
  it('returns default for invalid input', () => {
    expect(parseCommandCenterShortcut(null)).toEqual(
      DEFAULT_COMMAND_CENTER_SHORTCUT,
    )
  })

  it('parses stored binding', () => {
    expect(
      parseCommandCenterShortcut({ key: 'P', shiftKey: true, altKey: false }),
    ).toEqual({ key: 'p', shiftKey: true, altKey: false })
  })
})

describe('validateCommandCenterShortcut', () => {
  it('accepts letter keys', () => {
    expect(
      validateCommandCenterShortcut({
        key: 'p',
        shiftKey: false,
        altKey: false,
      }),
    ).toEqual({ key: 'p', shiftKey: false, altKey: false })
  })

  it('rejects multi-character keys', () => {
    expect(
      validateCommandCenterShortcut({
        key: 'enter',
        shiftKey: false,
        altKey: false,
      }),
    ).toBeNull()
  })
})

describe('findShortcutConflict', () => {
  it('allows the default Command Center binding', () => {
    expect(
      findShortcutConflict({ key: 'k', shiftKey: false, altKey: false }),
    ).toBeNull()
  })

  it('flags conversation dock binding', () => {
    expect(
      findShortcutConflict({ key: 'j', shiftKey: false, altKey: false }),
    ).toContain('Conversation dock')
  })

  it('allows unused bindings', () => {
    expect(
      findShortcutConflict({ key: 'p', shiftKey: false, altKey: false }),
    ).toBeNull()
  })
})

describe('bindingFromKeyEvent', () => {
  it('captures key and modifiers from a key event', () => {
    expect(
      bindingFromKeyEvent(ev('P', { metaKey: true, shiftKey: true })),
    ).toEqual({ key: 'p', shiftKey: true, altKey: false })
  })

  it('rejects unsupported keys', () => {
    expect(bindingFromKeyEvent(ev('Enter', { metaKey: true }))).toBeNull()
  })
})
