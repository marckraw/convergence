import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/shared/lib/color-contrast.pure'
import {
  backdropLabel,
  readDeclarations,
  readThemeTokens,
  resolveBackdrop,
  resolveThemeColor,
  type Backdrop,
} from './theme-contrast.pure'

/**
 * The theme-contrast canary (MAR-3460). It reads the color roles out of
 * `global.css` itself — the `:root` block for Light, `:root` overlaid by
 * `.dark` for Dark, the same cascade the `<html class="dark">` element sees —
 * and computes the WCAG contrast of every pair the UI relies on. A token edit
 * that makes a pair unreadable turns this red before anyone has to see it.
 *
 * The backgrounds are the opaque `--background`, `--card` and `--muted`
 * tokens. The translucent macOS window surfaces (`--main-surface`,
 * `--sidebar-surface`) sit over the desktop and have no fixed color to test
 * against; the cards and fields drawn on them paint the opaque tokens.
 */
const STYLESHEET = readFileSync(resolve(__dirname, 'global.css'), 'utf8')
const THEMES = readThemeTokens(STYLESHEET)
const ROOT = readDeclarations(STYLESHEET, ':root')
const DARK = readDeclarations(STYLESHEET, '.dark')

const TEXT = 4.5
const NON_TEXT = 3
const STATUSES = ['success', 'warning', 'error', 'info'] as const
const PLAIN_BACKDROPS = ['background', 'card', 'muted'] as const

/**
 * Every pair the canary holds, with its WCAG threshold: 4.5:1 for text,
 * 3:1 for the focus ring and a control's outline.
 */
const PAIRS: ReadonlyArray<readonly [string, Backdrop, number]> = [
  // Body and secondary text on every plain surface.
  ...PLAIN_BACKDROPS.flatMap((bg) => [
    ['foreground', bg, TEXT] as const,
    ['muted-foreground', bg, TEXT] as const,
  ]),
  // Status inks on every plain surface, and on their own tint over a card.
  ...STATUSES.flatMap((status) => [
    ...PLAIN_BACKDROPS.map((bg) => [`${status}-ink`, bg, TEXT] as const),
    [
      `${status}-ink`,
      { layer: `${status}-surface`, over: 'card' },
      TEXT,
    ] as const,
  ]),
  // The legacy warning alias its 43 users still write.
  ['warning-foreground', 'background', TEXT],
  ['warning-foreground', 'card', TEXT],
  // The solid destructive button, at rest and on hover (`/90`).
  ['destructive-foreground', 'destructive', TEXT],
  [
    'destructive-foreground',
    { layer: 'destructive', alpha: 0.9, over: 'background' },
    TEXT,
  ],
  [
    'destructive-foreground',
    { layer: 'destructive', alpha: 0.9, over: 'card' },
    TEXT,
  ],
  ['primary-foreground', 'primary', TEXT],
  ['accent-foreground', 'accent', TEXT],
  // Non-text: the focus ring and a control's outline.
  ['ring', 'background', NON_TEXT],
  ['ring', 'card', NON_TEXT],
  ['control-border', 'background', NON_TEXT],
  ['control-border', 'card', NON_TEXT],
]

describe('MAR-3460: theme color roles are readable in both themes', () => {
  describe.each(['light', 'dark'] as const)('%s', (theme) => {
    it.each(
      PAIRS.map(([fg, bg, min]) => [fg, backdropLabel(bg), min, bg] as const),
    )('--%s on %s clears %s:1', (fg, _label, min, bg) => {
      const ratio = contrastRatio(
        resolveThemeColor(THEMES[theme], fg),
        resolveBackdrop(THEMES[theme], bg),
      )
      expect(
        ratio,
        `${theme} --${fg} on ${backdropLabel(bg)} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(min)
    })

    it('secondary text stays visibly quieter than body text', () => {
      const ratio = contrastRatio(
        resolveThemeColor(THEMES[theme], 'foreground'),
        resolveThemeColor(THEMES[theme], 'muted-foreground'),
      )
      expect(ratio).toBeGreaterThanOrEqual(1.5)
    })
  })

  it('every status role is declared in both themes and mapped for Tailwind', () => {
    for (const status of STATUSES) {
      for (const role of ['ink', 'surface']) {
        const name = `${status}-${role}`
        expect(ROOT[name], `:root --${name}`).toBeDefined()
        expect(DARK[name], `.dark --${name}`).toBeDefined()
        expect(STYLESHEET).toContain(`--color-${name}: var(--${name});`)
      }
    }
    expect(STYLESHEET).toContain(
      '--color-control-border: var(--control-border);',
    )
  })

  it('the decorative border keeps its quiet value; controls get their own role', () => {
    expect(ROOT.border).toBe('oklch(0.88 0 0)')
    expect(DARK.border).toBe('oklch(0.32 0.005 260)')
    for (const theme of ['light', 'dark'] as const) {
      expect(THEMES[theme]['control-border']).not.toBe(THEMES[theme].border)
    }
  })

  it('follows var() aliases in the theme and refuses a cycle', () => {
    expect(resolveThemeColor(THEMES.light, 'warning-foreground')).toEqual(
      resolveThemeColor(THEMES.light, 'warning-ink'),
    )
    expect(() =>
      resolveThemeColor({ a: 'var(--b)', b: 'var(--a)' }, 'a'),
    ).toThrow(/cycle/)
    expect(() => readDeclarations('.x { --a: red; }', ':root')).toThrow(
      /no ":root \{" block/,
    )
  })
})
