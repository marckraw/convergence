import {
  compositeOver,
  parseCssColor,
  withAlpha,
  type Rgba,
} from '@/shared/lib/color-contrast.pure'

/**
 * Reads the theme's color tokens out of the stylesheet text, the way the
 * cascade resolves them, so the contrast canary tests what the app paints
 * rather than a copy of it (MAR-3460).
 */

/** Custom properties of a top-level `selector { … }` block, comments ignored. */
export function readDeclarations(
  css: string,
  selector: string,
): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = new RegExp(`^${escaped} \\{([\\s\\S]*?)^\\}`, 'm').exec(css)
  if (!block) throw new Error(`The stylesheet has no "${selector} {" block`)
  const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '')
  return Object.fromEntries(
    [...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim().replace(/\s+/g, ' '),
    ]),
  )
}

export type ThemeName = 'light' | 'dark'
export type ThemeTokens = Record<ThemeName, Record<string, string>>

/**
 * The two halves of a `light-dark(LIGHT, DARK)` value, split at its top-level
 * comma; `null` for any other value.
 */
export function splitLightDark(
  value: string,
): readonly [light: string, dark: string] | null {
  const match = /^light-dark\((.*)\)$/s.exec(value.trim())
  if (!match) return null
  let depth = 0
  for (let index = 0; index < match[1].length; index++) {
    const char = match[1][index]
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ',' && depth === 0) {
      return [match[1].slice(0, index).trim(), match[1].slice(index + 1).trim()]
    }
  }
  throw new Error(`light-dark() needs two values: "${value}"`)
}

/**
 * Both themes from `tokens.css` (MAR-3615): its top-level `:root` block, every
 * `light-dark(a, b)` split into Light's `a` and Dark's `b`. A plain value, or a
 * `var(--other)` alias, is the same in both. That is the cascade `<html
 * data-theme>` sees: `data-theme` only sets `color-scheme`, which picks the
 * half.
 */
export function readLightDarkTokens(css: string): ThemeTokens {
  const light: Record<string, string> = {}
  const dark: Record<string, string> = {}
  for (const [name, value] of Object.entries(readDeclarations(css, ':root'))) {
    const halves = splitLightDark(value)
    light[name] = halves ? halves[0] : value
    dark[name] = halves ? halves[1] : value
  }
  return { light, dark }
}

/** A token's color, following `var(--other)` aliases inside the theme. */
export function resolveThemeColor(
  tokens: Record<string, string>,
  name: string,
  seen: readonly string[] = [],
): Rgba {
  const value = tokens[name]
  if (value === undefined) throw new Error(`--${name} is not declared`)
  const reference = /^var\(--([a-z0-9-]+)\)$/.exec(value)
  if (reference) {
    if (seen.includes(name)) throw new Error(`var() cycle at --${name}`)
    return resolveThemeColor(tokens, reference[1], [...seen, name])
  }
  return parseCssColor(value)
}

/**
 * A backdrop: a token, or a token at an opacity laid over an opaque backdrop,
 * which may itself be a layer (a hover fill over a tinted card over the
 * surface).
 */
export type Backdrop =
  | string
  | { layer: string; alpha?: number; over: Backdrop }

export function resolveBackdrop(
  tokens: Record<string, string>,
  spec: Backdrop,
): Rgba {
  if (typeof spec === 'string') return resolveThemeColor(tokens, spec)
  return compositeOver(
    withAlpha(resolveThemeColor(tokens, spec.layer), spec.alpha ?? 1),
    resolveBackdrop(tokens, spec.over),
  )
}

export function backdropLabel(spec: Backdrop): string {
  if (typeof spec === 'string') return spec
  const layer =
    spec.alpha === undefined
      ? spec.layer
      : `${spec.layer}/${Math.round(spec.alpha * 100)}`
  return `${layer} over ${backdropLabel(spec.over)}`
}
