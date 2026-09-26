/**
 * WCAG 2.x contrast for the colors our stylesheet actually declares.
 *
 * The theme is written in `oklch()` (and a few `rgba()` surfaces), while WCAG
 * contrast is defined on gamma-encoded sRGB. This module walks the whole path
 * a browser walks to paint a token — OKLCH → OKLab → linear sRGB → clip to the
 * sRGB gamut → encode — then decodes with the WCAG transfer function to get
 * relative luminance. Translucent colors are composited over an opaque
 * backdrop in encoded sRGB, the space the compositor blends in.
 *
 * Gamut mapping is a per-channel clip in linear light, the same as a browser
 * painting an out-of-gamut `oklch()` on an sRGB display.
 */

/** A gamma-encoded sRGB color, channels and alpha in `[0, 1]`. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** sRGB encoding (IEC 61966-2-1): linear light → the stored channel. */
function encodeSrgb(linear: number): number {
  return linear <= 0.0031308
    ? 12.92 * linear
    : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
}

/** The WCAG 2.x transfer function: stored channel → linear light. */
function decodeSrgb(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4)
}

/** OKLCH (L in `[0, 1]`, hue in degrees) to gamma-encoded, gamut-clipped sRGB. */
export function oklchToRgba(
  lightness: number,
  chroma: number,
  hueDegrees: number,
  alpha = 1,
): Rgba {
  const hue = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)

  const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
  const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
  const s_ = lightness - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  return {
    r: encodeSrgb(clamp01(red)),
    g: encodeSrgb(clamp01(green)),
    b: encodeSrgb(clamp01(blue)),
    a: clamp01(alpha),
  }
}

function parseNumber(token: string, percentScale: number): number {
  const trimmed = token.trim()
  if (trimmed === 'none') return 0
  if (trimmed.endsWith('%')) {
    return (Number.parseFloat(trimmed) / 100) * percentScale
  }
  const value = Number.parseFloat(trimmed)
  if (Number.isNaN(value)) throw new Error(`Not a number: "${token}"`)
  return value
}

/**
 * Parses the color forms the theme uses: `oklch(L C H [/ A])`,
 * `rgb()`/`rgba()` in comma or space syntax, and `#rgb`/`#rrggbb`.
 */
export function parseCssColor(input: string): Rgba {
  const value = input.trim().toLowerCase()

  const oklch = /^oklch\(\s*([^)]*)\)$/.exec(value)
  if (oklch) {
    const [channels, alphaPart] = oklch[1].split('/')
    const parts = channels.trim().split(/\s+/)
    if (parts.length !== 3) throw new Error(`Bad oklch(): "${input}"`)
    return oklchToRgba(
      parseNumber(parts[0], 1),
      parseNumber(parts[1], 0.4),
      parseNumber(parts[2], 360),
      alphaPart === undefined ? 1 : parseNumber(alphaPart, 1),
    )
  }

  const rgb = /^rgba?\(\s*([^)]*)\)$/.exec(value)
  if (rgb) {
    const body = rgb[1]
    const parts = body.includes(',')
      ? body.split(',')
      : body.replace('/', ' ').trim().split(/\s+/)
    if (parts.length !== 3 && parts.length !== 4) {
      throw new Error(`Bad rgb(): "${input}"`)
    }
    return {
      r: clamp01(parseNumber(parts[0], 255) / 255),
      g: clamp01(parseNumber(parts[1], 255) / 255),
      b: clamp01(parseNumber(parts[2], 255) / 255),
      a: parts.length === 4 ? clamp01(parseNumber(parts[3], 1)) : 1,
    }
  }

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : hex[1]
    return {
      r: Number.parseInt(digits.slice(0, 2), 16) / 255,
      g: Number.parseInt(digits.slice(2, 4), 16) / 255,
      b: Number.parseInt(digits.slice(4, 6), 16) / 255,
      a: 1,
    }
  }

  throw new Error(`Unsupported color: "${input}"`)
}

/** Returns `color` with its alpha multiplied — Tailwind's `bg-x/90`. */
export function withAlpha(color: Rgba, alpha: number): Rgba {
  return { ...color, a: clamp01(color.a * alpha) }
}

/**
 * Source-over compositing of `top` onto an opaque `backdrop`, in encoded
 * sRGB. The result is opaque.
 */
export function compositeOver(top: Rgba, backdrop: Rgba): Rgba {
  if (backdrop.a < 1) {
    throw new Error('compositeOver needs an opaque backdrop')
  }
  const mix = (front: number, back: number): number =>
    front * top.a + back * (1 - top.a)
  return {
    r: mix(top.r, backdrop.r),
    g: mix(top.g, backdrop.g),
    b: mix(top.b, backdrop.b),
    a: 1,
  }
}

/** WCAG 2.x relative luminance of an opaque color. */
export function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * decodeSrgb(color.r) +
    0.7152 * decodeSrgb(color.g) +
    0.0722 * decodeSrgb(color.b)
  )
}

/**
 * WCAG 2.x contrast ratio between two colors, `1` to `21`. A translucent
 * foreground is composited over the background first; the background itself
 * must be opaque.
 */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const front =
    foreground.a < 1 ? compositeOver(foreground, background) : foreground
  const one = relativeLuminance(front)
  const two = relativeLuminance(background)
  const [lighter, darker] = one > two ? [one, two] : [two, one]
  return (lighter + 0.05) / (darker + 0.05)
}
