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
      match[2].trim(),
    ]),
  )
}

export type ThemeName = 'light' | 'dark'
export type ThemeTokens = Record<ThemeName, Record<string, string>>

/**
 * Light is `:root`; Dark is `:root` overlaid by `.dark` — both classes land on
 * the same `<html>` element, so every `:root` token Dark does not redeclare
 * still applies.
 */
export function readThemeTokens(css: string): ThemeTokens {
  const light = readDeclarations(css, ':root')
  return { light, dark: { ...light, ...readDeclarations(css, '.dark') } }
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

/** A backdrop: a token, or a token at an opacity laid over an opaque token. */
export type Backdrop = string | { layer: string; alpha?: number; over: string }

export function resolveBackdrop(
  tokens: Record<string, string>,
  spec: Backdrop,
): Rgba {
  if (typeof spec === 'string') return resolveThemeColor(tokens, spec)
  return compositeOver(
    withAlpha(resolveThemeColor(tokens, spec.layer), spec.alpha ?? 1),
    resolveThemeColor(tokens, spec.over),
  )
}

export function backdropLabel(spec: Backdrop): string {
  if (typeof spec === 'string') return spec
  const layer =
    spec.alpha === undefined
      ? spec.layer
      : `${spec.layer}/${Math.round(spec.alpha * 100)}`
  return `${layer} over ${spec.over}`
}
