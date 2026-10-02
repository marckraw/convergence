import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseCssColor } from '@/shared/lib/color-contrast.pure'
import {
  backdropLabel,
  readDeclarations,
  readLightDarkTokens,
  resolveBackdrop,
  resolveThemeColor,
  splitLightDark,
  type Backdrop,
} from './theme-contrast.pure'

/**
 * The theme-contrast canary (MAR-3460, on the tokens since MAR-3615). It reads
 * the colour tokens out of `tokens.css` itself (the top-level `:root` block,
 * each `light-dark(LIGHT, DARK)` split into its two themes, the halves
 * `<html data-theme>` picks between through `color-scheme`) and computes the
 * WCAG contrast of every pair the UI relies on. A token edit that makes a pair
 * unreadable turns this red before anyone has to see it.
 *
 * `tokens.css` sits beside the design system's theme, which `global.css`
 * imports as `@convergence/ui/theme.css`; it is found through that door.
 *
 * The backgrounds are the opaque surfaces (`--canvas`, `--surface`,
 * `--surface-muted`, `--raised`). The translucent macOS window chrome
 * (`--chrome-main`, `--chrome-sidebar`) sits over the desktop and has no fixed
 * colour to test against; the cards and fields drawn on it paint the opaque
 * tokens.
 */
const THEME_CSS_PATH = createRequire(__filename).resolve(
  '@convergence/ui/theme.css',
)
const THEME_CSS = readFileSync(THEME_CSS_PATH, 'utf8')
const TOKENS_CSS = readFileSync(
  join(dirname(THEME_CSS_PATH), 'tokens.css'),
  'utf8',
)
const ROOT = readDeclarations(TOKENS_CSS, ':root')
const THEMES = readLightDarkTokens(TOKENS_CSS)

const TEXT = 4.5
const NON_TEXT = 3
const PLAIN = ['canvas', 'surface', 'surface-muted', 'raised'] as const
const TONES = ['info', 'success', 'warning', 'danger'] as const
const PROVIDERS = ['openai', 'anthropic', 'pi', 'cursor', 'google'] as const
const TAGS = [
  'cyan',
  'sky',
  'green',
  'emerald',
  'lime',
  'teal',
  'violet',
  'indigo',
  'rose',
  'orange',
  'yellow',
  'zinc',
] as const

/**
 * Every pair the canary holds, with its WCAG threshold: 4.5:1 for text, 3:1
 * for what isn't text (a status dot, the focus ring, a control's outline).
 */
const PAIRS: ReadonlyArray<readonly [string, Backdrop, number]> = [
  // Body and secondary text on every plain surface.
  ...PLAIN.flatMap((bg) => [
    ['ink', bg, TEXT] as const,
    ['ink-muted', bg, TEXT] as const,
  ]),
  // Each tone's words on every plain surface, and on its own tint over the
  // surface and over the canvas (a badge, a notice).
  ...(['neutral', ...TONES] as const).flatMap((tone) => [
    ...PLAIN.map((bg) => [`${tone}-ink`, bg, TEXT] as const),
    [`${tone}-ink`, { layer: `${tone}-soft`, over: 'surface' }, TEXT] as const,
    [`${tone}-ink`, { layer: `${tone}-soft`, over: 'canvas' }, TEXT] as const,
  ]),
  // A card washed in a tone keeps its muted words readable (MAR-3617): a
  // canvas node's tint lies over the canvas (CARD_TONE_WASH), and Loom's horse
  // at work or failed sits on the open sheet's surface. Over the surface,
  // warning's and success's tints leave --ink-muted under 4.5:1 in dark, so no
  // card in Mission Control or Loom lays those two there.
  ...(['neutral', ...TONES] as const).map(
    (tone) =>
      ['ink-muted', { layer: `${tone}-soft`, over: 'canvas' }, TEXT] as const,
  ),
  ['ink-muted', { layer: 'info-soft', over: 'surface' }, TEXT],
  ['ink-muted', { layer: 'danger-soft', over: 'surface' }, TEXT],
  // Muted words on any tone's tint, wherever the tint lies (MAR-3618): what
  // --ink-muted can't hold there, --ink-muted-on-tint does, in both themes.
  ...(['neutral', ...TONES] as const).flatMap((tone) =>
    (['canvas', 'surface', 'surface-muted'] as const).map(
      (over) =>
        ['ink-muted-on-tint', { layer: `${tone}-soft`, over }, TEXT] as const,
    ),
  ),
  // A Needs-you card: its provider's hue at 6% over the surface, and the
  // hover fill (R7) over that under the pointer (needs-you-card.css).
  ...PROVIDERS.flatMap((provider) => {
    const card = {
      layer: `provider-${provider}`,
      alpha: 0.06,
      over: 'surface',
    } as const
    return [
      ['ink-muted', card, TEXT] as const,
      ['ink-muted', { layer: 'fill-hover', over: card }, TEXT] as const,
    ]
  }),
  // Each tone's dot or bar, where it sits. Neutral's is the idle dot, which
  // only recedes, so it isn't held to 3:1.
  ...TONES.flatMap((tone) =>
    (['canvas', 'surface', 'surface-muted'] as const).map(
      (bg) => [`${tone}-solid`, bg, NON_TEXT] as const,
    ),
  ),
  // The destructive button, at rest and on hover (`/90`).
  ['on-danger', 'danger-solid', TEXT],
  ['on-danger', { layer: 'danger-solid', alpha: 0.9, over: 'canvas' }, TEXT],
  ['on-danger', { layer: 'danger-solid', alpha: 0.9, over: 'surface' }, TEXT],
  ['on-strong', 'strong', TEXT],
  ['on-highlight', 'highlight', TEXT],
  // R7: the chosen chip and the selected row; R8: tooltips and dialogs.
  ['ink', 'chip', TEXT],
  ['ink', 'fill-selected', TEXT],
  ['ink', { layer: 'glass', over: 'canvas' }, TEXT],
  ['ink', { layer: 'sheet', over: 'canvas' }, TEXT],
  // A category's word on its own pill (the hue at 10% over a card).
  ...TAGS.map(
    (hue) =>
      [
        `tag-${hue}-ink`,
        { layer: `tag-${hue}`, alpha: 0.1, over: 'surface' },
        TEXT,
      ] as const,
  ),
  ['merged-ink', { layer: 'merged', alpha: 0.1, over: 'surface' }, TEXT],
  ['on-avatar-agent', 'avatar-agent', TEXT],
  // A diff's line counts on a turn card.
  ...(['canvas', 'surface'] as const).flatMap((bg) => [
    ['diff-added', bg, TEXT] as const,
    ['diff-removed', bg, TEXT] as const,
  ]),
  // Non-text: the focus ring and a control's outline.
  ['focus', 'canvas', NON_TEXT],
  ['focus', 'surface', NON_TEXT],
  ['control-line', 'canvas', NON_TEXT],
  ['control-line', 'surface', NON_TEXT],
  // The terminal, dark in both themes (R12).
  ['terminal-ink', 'terminal-bg', TEXT],
  ['terminal-tab-ink', 'terminal-tab', TEXT],
  ['terminal-tab-ink-muted', 'terminal-tab', TEXT],
  [
    'terminal-tab-ink-muted',
    { layer: 'terminal-strip', over: 'terminal-bg' },
    TEXT,
  ],
]

/** Whether a declared value is a colour, `light-dark()` or not. */
function isColour(value: string): boolean {
  const halves = splitLightDark(value)
  try {
    parseCssColor(halves ? halves[0] : value)
    return true
  } catch {
    return false
  }
}

/** The token names whose value is a colour (aliases followed). */
function colourTokens(): string[] {
  return Object.keys(ROOT).filter((name) => {
    try {
      resolveThemeColor(THEMES.light, name)
      return true
    } catch {
      return false
    }
  })
}

describe('MAR-3460: theme color roles are readable in both themes', () => {
  it('holds 117 pairs in each theme', () => {
    expect(PAIRS).toHaveLength(117)
  })

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

    it.each(['ink-muted', 'ink-muted-on-tint'])(
      'secondary text (--%s) stays visibly quieter than body text',
      (muted) => {
        const ratio = contrastRatio(
          resolveThemeColor(THEMES[theme], 'ink'),
          resolveThemeColor(THEMES[theme], muted),
        )
        expect(ratio).toBeGreaterThanOrEqual(1.5)
      },
    )
  })
})

describe('MAR-3615: the tokens carry both themes', () => {
  it('every colour is light-dark() with two colours, except the terminal’s (R12)', () => {
    const colours = Object.entries(ROOT).filter(([, value]) => isColour(value))
    expect(colours.length).toBeGreaterThan(100)
    for (const [name, value] of colours) {
      if (name.startsWith('terminal-')) {
        expect(splitLightDark(value), `--${name} is one value`).toBeNull()
        continue
      }
      const halves = splitLightDark(value)
      expect(halves, `--${name} is light-dark()`).not.toBeNull()
      expect(() => parseCssColor(halves![0]), `--${name} light`).not.toThrow()
      expect(() => parseCssColor(halves![1]), `--${name} dark`).not.toThrow()
    }
  })

  it('every colour token is a Tailwind colour, except what only app CSS and xterm read', () => {
    const unmapped = colourTokens().filter(
      (name) =>
        !THEME_CSS.includes(`--color-${name}: var(--${name});`) &&
        !/^(chrome-|scrollbar-|terminal-(cursor|selection|ansi-))/.test(name),
    )
    expect(unmapped).toEqual([])
  })

  it('data-theme picks the half through color-scheme; with none the system does', () => {
    expect(TOKENS_CSS).toMatch(/^:root \{\s*color-scheme: light dark;/m)
    expect(TOKENS_CSS).toMatch(
      /^\[data-theme='light'\] \{\s*color-scheme: light;\s*\}/m,
    )
    expect(TOKENS_CSS).toMatch(
      /^\[data-theme='dark'\] \{\s*color-scheme: dark;\s*\}/m,
    )
  })

  it('the decorative line keeps its quiet value; controls get their own role', () => {
    expect(splitLightDark(ROOT.line)).toEqual([
      'oklch(0.88 0 0)',
      'oklch(0.32 0.005 260)',
    ])
    for (const theme of ['light', 'dark'] as const) {
      expect(THEMES[theme]['control-line']).not.toBe(THEMES[theme].line)
    }
  })

  it('R7: the hover fill is exactly half of the selected fill', () => {
    for (const theme of ['light', 'dark'] as const) {
      const selected = resolveThemeColor(THEMES[theme], 'fill-selected')
      const hover = resolveThemeColor(THEMES[theme], 'fill-hover')
      expect({ ...hover, a: 1 }).toEqual({ ...selected, a: 1 })
      expect(hover.a).toBe(selected.a / 2)
    }
  })

  it('follows var() aliases in the tokens and refuses a cycle', () => {
    expect(ROOT['merged-ink']).toBe('var(--tag-teal-ink)')
    expect(resolveThemeColor(THEMES.light, 'merged-ink')).toEqual(
      resolveThemeColor(THEMES.light, 'tag-teal-ink'),
    )
    expect(resolveThemeColor(THEMES.dark, 'fill-selected')).toEqual(
      resolveThemeColor(THEMES.dark, 'highlight'),
    )
    expect(() =>
      resolveThemeColor({ a: 'var(--b)', b: 'var(--a)' }, 'a'),
    ).toThrow(/cycle/)
    expect(() => readDeclarations('.x { --a: red; }', ':root')).toThrow(
      /no ":root \{" block/,
    )
  })

  it('splits light-dark() at its top-level comma only', () => {
    expect(
      splitLightDark('light-dark(oklch(0.5 0 0 / 0.1), rgb(255 255 255))'),
    ).toEqual(['oklch(0.5 0 0 / 0.1)', 'rgb(255 255 255)'])
    expect(
      splitLightDark('light-dark(rgba(1, 2, 3, 0.4), rgba(5, 6, 7, 0.8))'),
    ).toEqual(['rgba(1, 2, 3, 0.4)', 'rgba(5, 6, 7, 0.8)'])
    expect(splitLightDark('oklch(0.5 0 0)')).toBeNull()
    expect(() => splitLightDark('light-dark(red)')).toThrow(/two values/)
  })
})
