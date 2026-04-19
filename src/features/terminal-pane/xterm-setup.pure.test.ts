import { describe, it, expect } from 'vitest'
import {
  buildXtermOptions,
  computeDimensions,
  DEFAULT_THEME,
} from './xterm-setup.pure'

describe('buildXtermOptions', () => {
  it('returns sensible defaults', () => {
    const options = buildXtermOptions()
    expect(options.fontSize).toBe(13)
    expect(options.lineHeight).toBe(1.2)
    expect(options.cursorBlink).toBe(true)
    expect(options.scrollback).toBe(10_000)
    expect(options.allowProposedApi).toBe(true)
    expect(options.theme).toBe(DEFAULT_THEME)
    expect(options.macOptionIsMeta).toBe(true)
    expect(options.rightClickSelectsWord).toBe(true)
    expect(options.fontFamily).toContain('JetBrainsMono')
  })

  it('applies overrides on top of defaults', () => {
    const options = buildXtermOptions({ fontSize: 16, cursorBlink: false })
    expect(options.fontSize).toBe(16)
    expect(options.cursorBlink).toBe(false)
    expect(options.scrollback).toBe(10_000)
  })
})

describe('DEFAULT_THEME', () => {
  it('has background, foreground, and all ANSI colors', () => {
    expect(DEFAULT_THEME.background).toMatch(/^#[0-9a-f]{6}$/i)
    expect(DEFAULT_THEME.foreground).toMatch(/^#[0-9a-f]{6}$/i)
    const keys = [
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'brightBlack',
      'brightRed',
      'brightGreen',
      'brightYellow',
      'brightBlue',
      'brightMagenta',
      'brightCyan',
      'brightWhite',
    ] as const
    for (const key of keys) {
      expect(DEFAULT_THEME[key]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('computeDimensions', () => {
  it('floors pixel sizes to whole cells', () => {
    expect(
      computeDimensions({
        pixelWidth: 800,
        pixelHeight: 600,
        cellWidth: 9,
        cellHeight: 17,
      }),
    ).toEqual({ cols: 88, rows: 35 })
  })

  it('clamps to at least 1x1 when pixel sizes are tiny', () => {
    expect(
      computeDimensions({
        pixelWidth: 4,
        pixelHeight: 4,
        cellWidth: 9,
        cellHeight: 17,
      }),
    ).toEqual({ cols: 1, rows: 1 })
  })

  it('returns 1x1 when cell metrics are non-positive', () => {
    expect(
      computeDimensions({
        pixelWidth: 800,
        pixelHeight: 600,
        cellWidth: 0,
        cellHeight: 17,
      }),
    ).toEqual({ cols: 1, rows: 1 })
    expect(
      computeDimensions({
        pixelWidth: 800,
        pixelHeight: 600,
        cellWidth: 9,
        cellHeight: -1,
      }),
    ).toEqual({ cols: 1, rows: 1 })
  })
})
