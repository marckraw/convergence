import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The legacy bridge holds (MAR-3615 DS2 → DS5).
 *
 * Until DS4 has swept the app onto the token names, the shadcn names it still
 * writes (`bg-background`, `text-muted-foreground`, `var(--foreground)` …)
 * paint through the bridge at the end of theme.css. This pins every one of
 * them, in both themes and with the macOS translucency on and off, to the
 * value it had at master 6f6ebb93, frozen below, before tokens.css existed.
 * The app's three chrome names were renamed on the way (`--sidebar-surface`,
 * `--sidebar-sheen` and `--main-surface` are `--chrome-sidebar`,
 * `--chrome-sheen` and `--chrome-main`). DS5 deletes the bridge and this test
 * with it.
 */
const MASTER_LIGHT: Record<string, string> = {
  background: 'oklch(0.985 0 0)',
  foreground: 'oklch(0.145 0 0)',
  card: 'oklch(0.975 0 0)',
  'card-foreground': 'oklch(0.145 0 0)',
  popover: 'oklch(0.985 0 0)',
  'popover-foreground': 'oklch(0.145 0 0)',
  primary: 'oklch(0.205 0 0)',
  'primary-foreground': 'oklch(0.985 0 0)',
  secondary: 'oklch(0.955 0 0)',
  'secondary-foreground': 'oklch(0.205 0 0)',
  muted: 'oklch(0.955 0 0)',
  'muted-foreground': 'oklch(0.46 0 0)',
  accent: 'oklch(0.915 0.075 95)',
  'accent-foreground': 'oklch(0.28 0.04 80)',
  destructive: 'oklch(0.55 0.23 27.325)',
  'destructive-foreground': 'oklch(0.985 0 0)',
  warning: 'oklch(0.78 0.16 75)',
  'warning-foreground': 'oklch(0.46 0.13 65)',
  'success-ink': 'oklch(0.48 0.13 150)',
  'warning-ink': 'oklch(0.46 0.13 65)',
  'info-ink': 'oklch(0.48 0.13 250)',
  border: 'oklch(0.88 0 0)',
  'control-border': 'oklch(0.62 0 0)',
  input: 'oklch(0.88 0 0)',
  ring: 'oklch(0.5 0 0)',
  sidebar: 'oklch(0.96 0 0)',
  'chrome-edge': 'rgba(255, 255, 255, 0.48)',
  'chrome-shadow': 'rgba(15, 23, 42, 0.12)',
  'sidebar-surface': 'rgba(255, 255, 255, 0.76)',
  'sidebar-sheen': 'rgba(255, 255, 255, 0.48)',
  'main-surface': 'rgba(252, 252, 253, 0.86)',
  'scrollbar-track': 'rgba(255, 255, 255, 0.08)',
  'scrollbar-thumb': 'rgba(17, 24, 39, 0.2)',
  'scrollbar-thumb-hover': 'rgba(17, 24, 39, 0.3)',
}

const MASTER_DARK: Record<string, string> = {
  background: 'oklch(0.21 0.005 260)',
  foreground: 'oklch(0.88 0 0)',
  card: 'oklch(0.24 0.005 260)',
  'card-foreground': 'oklch(0.88 0 0)',
  popover: 'oklch(0.24 0.005 260)',
  'popover-foreground': 'oklch(0.88 0 0)',
  primary: 'oklch(0.88 0 0)',
  'primary-foreground': 'oklch(0.18 0 0)',
  secondary: 'oklch(0.27 0.005 260)',
  'secondary-foreground': 'oklch(0.88 0 0)',
  muted: 'oklch(0.27 0.005 260)',
  'muted-foreground': 'oklch(0.66 0 0)',
  accent: 'oklch(0.27 0.005 260)',
  'accent-foreground': 'oklch(0.88 0 0)',
  destructive: 'oklch(0.704 0.191 22.216)',
  'destructive-foreground': 'oklch(0.18 0 0)',
  warning: 'oklch(0.78 0.16 75)',
  'warning-foreground': 'oklch(0.86 0.13 85)',
  'success-ink': 'oklch(0.78 0.13 150)',
  'warning-ink': 'oklch(0.86 0.13 85)',
  'info-ink': 'oklch(0.78 0.13 250)',
  border: 'oklch(0.32 0.005 260)',
  'control-border': 'oklch(0.55 0.005 260)',
  input: 'oklch(0.28 0.005 260)',
  ring: 'oklch(0.72 0 0)',
  sidebar: 'oklch(0.17 0.005 260)',
  'chrome-edge': 'rgba(255, 255, 255, 0.12)',
  'chrome-shadow': 'rgba(0, 0, 0, 0.38)',
  'sidebar-surface': 'rgba(16, 19, 27, 0.62)',
  'sidebar-sheen': 'rgba(255, 255, 255, 0.08)',
  'main-surface': 'rgba(22, 25, 33, 0.82)',
  'scrollbar-track': 'rgba(255, 255, 255, 0.04)',
  'scrollbar-thumb': 'rgba(255, 255, 255, 0.14)',
  'scrollbar-thumb-hover': 'rgba(255, 255, 255, 0.22)',
}

/** :root[data-platform='darwin'][data-reduced-transparency='false'] */
const MASTER_LIGHT_TRANSLUCENT: Record<string, string> = {
  ...MASTER_LIGHT,
  'sidebar-surface': 'rgba(255, 255, 255, 0.62)',
  'main-surface': 'rgba(250, 250, 252, 0.78)',
}

/** .dark[data-platform='darwin'][data-reduced-transparency='false'] */
const MASTER_DARK_TRANSLUCENT: Record<string, string> = {
  ...MASTER_DARK,
  'sidebar-surface': 'rgba(14, 17, 25, 0.42)',
  'sidebar-sheen': 'rgba(255, 255, 255, 0.1)',
  'main-surface': 'rgba(19, 22, 30, 0.72)',
  'scrollbar-track': 'rgba(255, 255, 255, 0.035)',
  'scrollbar-thumb': 'rgba(255, 255, 255, 0.16)',
  'scrollbar-thumb-hover': 'rgba(255, 255, 255, 0.26)',
}

/**
 * Master's six names nothing read, in the app or in Streamdown: they go
 * rather than cross the bridge. The tones' `-soft` replace the `-surface`s,
 * `--danger-ink` replaces `--error-ink`.
 */
const DROPPED = [
  'success-surface',
  'warning-surface',
  'error-ink',
  'error-surface',
  'info-surface',
  'sidebar-foreground',
]

const RENAMED: Record<string, string> = {
  'sidebar-surface': 'chrome-sidebar',
  'sidebar-sheen': 'chrome-sheen',
  'main-surface': 'chrome-main',
}

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const tokens = strip(readFileSync(join(__dirname, 'tokens.css'), 'utf8'))
const theme = strip(readFileSync(join(__dirname, 'theme.css'), 'utf8'))

/** The custom properties of a top-level `selector {` block. */
function block(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^${escaped} \\{([\\s\\S]*?)^\\}`, 'm').exec(css)
  if (!match) throw new Error(`no "${selector} {" block`)
  return Object.fromEntries(
    [...match[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim().replace(/\s+/g, ' '),
    ]),
  )
}

/** The halves of light-dark(a, b), split at its top-level comma. */
function half(value: string, dark: boolean): string {
  const match = /^light-dark\((.*)\)$/.exec(value)
  if (!match) return value
  let depth = 0
  for (let index = 0; index < match[1].length; index++) {
    const char = match[1][index]
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ',' && depth === 0) {
      return (dark ? match[1].slice(index + 1) : match[1].slice(0, index))
        .trim()
        .replace(/\s+/g, ' ')
    }
  }
  throw new Error(`light-dark() needs two values: ${value}`)
}

/** A name as the page resolves it: aliases followed, light-dark() halved. */
function resolve(
  vars: Record<string, string>,
  name: string,
  dark: boolean,
  seen: string[] = [],
): string | undefined {
  const value = vars[name]
  if (value === undefined) return undefined
  const alias = /^var\(--([a-z0-9-]+)\)$/.exec(value)
  if (alias) {
    if (seen.includes(name)) throw new Error(`var() cycle at --${name}`)
    return resolve(vars, alias[1], dark, [...seen, name])
  }
  return half(value, dark)
}

const ROOT = { ...block(tokens, ':root'), ...block(theme, ':root') }
const TRANSLUCENT = {
  ...ROOT,
  ...block(
    tokens,
    ":root[data-platform='darwin'][data-reduced-transparency='false']",
  ),
}

describe('MAR-3615: every legacy name paints what it painted at 6f6ebb93', () => {
  it.each([
    ['light', MASTER_LIGHT, ROOT, false],
    ['dark', MASTER_DARK, ROOT, true],
    ['light, translucent', MASTER_LIGHT_TRANSLUCENT, TRANSLUCENT, false],
    ['dark, translucent', MASTER_DARK_TRANSLUCENT, TRANSLUCENT, true],
  ] as const)('%s', (_context, master, vars, dark) => {
    const resolved = Object.fromEntries(
      Object.keys(master).map((name) => [
        name,
        resolve(vars, RENAMED[name] ?? name, dark),
      ]),
    )
    expect(resolved).toEqual(master)
  })

  it('keeps every shadcn colour name a Tailwind colour', () => {
    for (const name of Object.keys(MASTER_LIGHT)) {
      if (/^(chrome|scrollbar|sidebar-|main-|.*-ink$)/.test(name)) continue
      expect(theme).toContain(`--color-${name}: var(--${name});`)
    }
  })

  it('drops only the names nothing read', () => {
    for (const name of DROPPED) {
      expect(ROOT[name], `--${name}`).toBeUndefined()
      expect(theme).not.toContain(`--color-${name}:`)
    }
  })
})
