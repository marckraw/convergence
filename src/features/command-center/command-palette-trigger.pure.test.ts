import { describe, expect, it } from 'vitest'
import {
  matchPaletteShortcut,
  type KeyEventLike,
  type Platform,
} from './command-palette-trigger.pure'

function ev(partial: Partial<KeyEventLike>): KeyEventLike {
  return {
    key: 'k',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...partial,
  }
}

describe('matchPaletteShortcut', () => {
  const mac: Platform = 'mac'
  const other: Platform = 'other'

  it('matches bare Cmd+K on mac', () => {
    expect(matchPaletteShortcut(ev({ metaKey: true }), mac)).toBe(true)
  })

  it('matches bare Ctrl+K on other platforms', () => {
    expect(matchPaletteShortcut(ev({ ctrlKey: true }), other)).toBe(true)
  })

  it('matches uppercase K with the modifier', () => {
    expect(matchPaletteShortcut(ev({ metaKey: true, key: 'K' }), mac)).toBe(
      true,
    )
  })

  it('rejects Ctrl+K on mac (opposite modifier)', () => {
    expect(matchPaletteShortcut(ev({ ctrlKey: true }), mac)).toBe(false)
  })

  it('rejects Cmd+K on other platforms (opposite modifier)', () => {
    expect(matchPaletteShortcut(ev({ metaKey: true }), other)).toBe(false)
  })

  it('rejects when both modifiers held', () => {
    expect(
      matchPaletteShortcut(ev({ metaKey: true, ctrlKey: true }), mac),
    ).toBe(false)
  })

  it('rejects Cmd+Shift+K', () => {
    expect(
      matchPaletteShortcut(ev({ metaKey: true, shiftKey: true }), mac),
    ).toBe(false)
  })

  it('rejects Cmd+Alt+K', () => {
    expect(matchPaletteShortcut(ev({ metaKey: true, altKey: true }), mac)).toBe(
      false,
    )
  })

  it('rejects bare K without modifier', () => {
    expect(matchPaletteShortcut(ev({}), mac)).toBe(false)
  })

  it('rejects Cmd+J (wrong key)', () => {
    expect(matchPaletteShortcut(ev({ metaKey: true, key: 'j' }), mac)).toBe(
      false,
    )
  })

  it('rejects Cmd alone (no K)', () => {
    expect(matchPaletteShortcut(ev({ metaKey: true, key: 'Meta' }), mac)).toBe(
      false,
    )
  })
})
