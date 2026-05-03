import { describe, expect, it } from 'vitest'
import { matchShortcut, type KeyEventLike } from './keymap.pure'

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

describe('matchShortcut (mac)', () => {
  it('Cmd-T → new-tab', () => {
    expect(matchShortcut(ev('t', { metaKey: true }), 'mac')).toEqual({
      kind: 'new-tab',
    })
  })

  it('Cmd-D → split vertical', () => {
    expect(matchShortcut(ev('d', { metaKey: true }), 'mac')).toEqual({
      kind: 'split',
      direction: 'vertical',
    })
  })

  it('Cmd-Shift-D → split horizontal', () => {
    expect(
      matchShortcut(ev('D', { metaKey: true, shiftKey: true }), 'mac'),
    ).toEqual({ kind: 'split', direction: 'horizontal' })
  })

  it('Cmd-W → close-tab', () => {
    expect(matchShortcut(ev('w', { metaKey: true }), 'mac')).toEqual({
      kind: 'close-tab',
    })
  })

  it('Cmd-Shift-[ → cycle prev', () => {
    expect(
      matchShortcut(ev('[', { metaKey: true, shiftKey: true }), 'mac'),
    ).toEqual({ kind: 'cycle-tab', direction: 'prev' })
  })

  it('Cmd-Shift-] → cycle next', () => {
    expect(
      matchShortcut(ev(']', { metaKey: true, shiftKey: true }), 'mac'),
    ).toEqual({ kind: 'cycle-tab', direction: 'next' })
  })

  it('Cmd-Alt-ArrowLeft → focus left', () => {
    expect(
      matchShortcut(ev('ArrowLeft', { metaKey: true, altKey: true }), 'mac'),
    ).toEqual({ kind: 'focus-adjacent', direction: 'left' })
  })

  it('Cmd-Alt-ArrowRight → focus right', () => {
    expect(
      matchShortcut(ev('ArrowRight', { metaKey: true, altKey: true }), 'mac'),
    ).toEqual({ kind: 'focus-adjacent', direction: 'right' })
  })

  it('Cmd-Alt-ArrowUp → focus up', () => {
    expect(
      matchShortcut(ev('ArrowUp', { metaKey: true, altKey: true }), 'mac'),
    ).toEqual({ kind: 'focus-adjacent', direction: 'up' })
  })

  it('Cmd-Alt-ArrowDown → focus down', () => {
    expect(
      matchShortcut(ev('ArrowDown', { metaKey: true, altKey: true }), 'mac'),
    ).toEqual({ kind: 'focus-adjacent', direction: 'down' })
  })

  it('Cmd-K → clear', () => {
    expect(matchShortcut(ev('k', { metaKey: true }), 'mac')).toEqual({
      kind: 'clear',
    })
  })

  it('Cmd-` → toggle dock', () => {
    expect(matchShortcut(ev('`', { metaKey: true }), 'mac')).toEqual({
      kind: 'toggle-dock',
    })
  })

  it('plain key returns null', () => {
    expect(matchShortcut(ev('t'), 'mac')).toBeNull()
  })

  it('Ctrl-T on mac returns null (wrong modifier)', () => {
    expect(matchShortcut(ev('t', { ctrlKey: true }), 'mac')).toBeNull()
  })

  it('Cmd-X (unknown key) returns null', () => {
    expect(matchShortcut(ev('x', { metaKey: true }), 'mac')).toBeNull()
  })

  it('Cmd-Shift-T → cycle dock placement', () => {
    expect(
      matchShortcut(ev('T', { metaKey: true, shiftKey: true }), 'mac'),
    ).toEqual({ kind: 'cycle-dock-placement' })
  })

  it('Cmd-Alt-T (extra alt on new-tab) returns null', () => {
    expect(
      matchShortcut(ev('t', { metaKey: true, altKey: true }), 'mac'),
    ).toBeNull()
  })
})

describe('matchShortcut (other platforms use Ctrl)', () => {
  it('Ctrl-T → new-tab on non-mac', () => {
    expect(matchShortcut(ev('t', { ctrlKey: true }), 'other')).toEqual({
      kind: 'new-tab',
    })
  })

  it('Cmd-T on non-mac returns null', () => {
    expect(matchShortcut(ev('t', { metaKey: true }), 'other')).toBeNull()
  })

  it('Ctrl-Shift-D → split horizontal on non-mac', () => {
    expect(
      matchShortcut(ev('D', { ctrlKey: true, shiftKey: true }), 'other'),
    ).toEqual({ kind: 'split', direction: 'horizontal' })
  })

  it('Ctrl-Alt-ArrowLeft → focus left on non-mac', () => {
    expect(
      matchShortcut(ev('ArrowLeft', { ctrlKey: true, altKey: true }), 'other'),
    ).toEqual({ kind: 'focus-adjacent', direction: 'left' })
  })
})
