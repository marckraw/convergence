import { describe, expect, it } from 'vitest'
import {
  compositeOver,
  contrastRatio,
  oklchToRgba,
  parseCssColor,
  relativeLuminance,
  withAlpha,
} from './color-contrast.pure'

const ratio = (foreground: string, background: string): number =>
  contrastRatio(parseCssColor(foreground), parseCssColor(background))

describe('color contrast (WCAG 2.x)', () => {
  it('black on white is 21:1 and a color on itself is 1:1', () => {
    expect(ratio('#000', '#fff')).toBeCloseTo(21, 5)
    expect(ratio('rgb(0, 0, 0)', 'oklch(1 0 0)')).toBeCloseTo(21, 3)
    expect(ratio('oklch(0.5 0 0)', 'oklch(0.5 0 0)')).toBe(1)
  })

  it('reproduces the audit’s shipped dark pairs (MAR-3418, 0.87.0)', () => {
    // Dark `--muted-foreground` oklch(0.58 0 0) on background and card.
    expect(
      Math.abs(ratio('oklch(0.58 0 0)', 'oklch(0.21 0.005 260)') - 4.14),
    ).toBeLessThanOrEqual(0.05)
    expect(
      Math.abs(ratio('oklch(0.58 0 0)', 'oklch(0.24 0.005 260)') - 3.84),
    ).toBeLessThanOrEqual(0.05)
    // Dark destructive button: oklch(0.88 0 0) on the bright red, ~2.0:1.
    expect(
      Math.abs(ratio('oklch(0.88 0 0)', 'oklch(0.704 0.191 22.216)') - 2.01),
    ).toBeLessThanOrEqual(0.05)
  })

  it('a mid-gray sits where the sRGB transfer function puts it', () => {
    // #777 is the classic 4.48:1 on white; without the transfer function it
    // would read as luminance 0.467 and ~2.0:1.
    expect(relativeLuminance(parseCssColor('#777777'))).toBeCloseTo(0.1845, 3)
    expect(ratio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })

  it('parses oklch with alpha, percentages and rgba in both syntaxes', () => {
    expect(parseCssColor('oklch(0.72 0.15 75 / 0.14)').a).toBeCloseTo(0.14)
    expect(parseCssColor('oklch(100% 0 0)')).toEqual(
      parseCssColor('oklch(1 0 0)'),
    )
    expect(parseCssColor('rgba(255, 255, 255, 0.48)')).toEqual({
      r: 1,
      g: 1,
      b: 1,
      a: 0.48,
    })
    expect(parseCssColor('rgb(255 0 0 / 0.5)')).toEqual({
      r: 1,
      g: 0,
      b: 0,
      a: 0.5,
    })
    expect(() => parseCssColor('var(--card)')).toThrow(/Unsupported/)
  })

  it('maps the oklch lightness axis onto sRGB black, white and gray', () => {
    const white = oklchToRgba(1, 0, 0)
    const black = oklchToRgba(0, 0, 0)
    for (const channel of [white.r, white.g, white.b]) {
      expect(channel).toBeCloseTo(1, 4)
    }
    expect(black).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    // A neutral oklch L is the cube root of linear light: 0.6^3 = 0.216,
    // which sRGB-encodes to 0.502 (#808080).
    expect(oklchToRgba(0.6, 0, 0).g).toBeCloseTo(0.502, 3)
    expect(oklchToRgba(0.5, 0, 0, 0.25).a).toBe(0.25)
  })

  it('clips an out-of-gamut oklch into sRGB instead of overflowing', () => {
    const vivid = parseCssColor('oklch(0.7 0.4 145)')
    for (const channel of [vivid.r, vivid.g, vivid.b]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  it('composites a translucent color over an opaque backdrop', () => {
    const half = compositeOver(
      withAlpha(parseCssColor('#000'), 0.5),
      parseCssColor('#fff'),
    )
    expect(half).toEqual({ r: 0.5, g: 0.5, b: 0.5, a: 1 })
    // Contrast of a translucent foreground is taken after compositing.
    expect(
      contrastRatio(
        withAlpha(parseCssColor('#000'), 0.5),
        parseCssColor('#fff'),
      ),
    ).toBeCloseTo(contrastRatio(half, parseCssColor('#fff')), 10)
    expect(() =>
      compositeOver(parseCssColor('#000'), parseCssColor('rgba(0,0,0,0.5)')),
    ).toThrow(/opaque/)
  })
})
