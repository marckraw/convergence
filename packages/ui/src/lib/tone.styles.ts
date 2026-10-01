/*
 * The five status tones (R1, MAR-3616) as class maps, one per role, so every
 * part that says something about a state paints it the same way and never
 * reaches for a palette colour. The roles are tokens.css's: -ink for words and
 * glyphs, -soft for the tint behind them, -line for that tint's edge, -solid for
 * dots and bars. Which state wears which tone is the owning entity's decision
 * (entities/session for a session), never a part's.
 *
 * Every class is written out whole, so Tailwind finds it in this file.
 */

/** The tones, in order from quietest to loudest. */
export const TONES = [
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
] as const

/**
 * What a thing's state says: neutral (idle, closed), info (working, a hint),
 * success (finished), warning (waiting on you, unreachable: never red),
 * danger (failed). Never colour alone: a word or a glyph says it too.
 */
export type Tone = (typeof TONES)[number]

/** Words and glyphs in the tone. */
export const toneInk: Record<Tone, string> = {
  neutral: 'text-neutral-ink',
  info: 'text-info-ink',
  success: 'text-success-ink',
  warning: 'text-warning-ink',
  danger: 'text-danger-ink',
}

/** The tint behind a tone's words. */
export const toneSoft: Record<Tone, string> = {
  neutral: 'bg-neutral-soft',
  info: 'bg-info-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
}

/** The edge of a tone's tint. */
export const toneLine: Record<Tone, string> = {
  neutral: 'border-neutral-line',
  info: 'border-info-line',
  success: 'border-success-line',
  warning: 'border-warning-line',
  danger: 'border-danger-line',
}

/** A dot or a bar's fill in the tone. */
export const toneSolid: Record<Tone, string> = {
  neutral: 'bg-neutral-solid',
  info: 'bg-info-solid',
  success: 'bg-success-solid',
  warning: 'bg-warning-solid',
  danger: 'bg-danger-solid',
}

/** A ring's stroke in the tone (Meter's ring). */
export const toneStroke: Record<Tone, string> = {
  neutral: 'stroke-neutral-solid',
  info: 'stroke-info-solid',
  success: 'stroke-success-solid',
  warning: 'stroke-warning-solid',
  danger: 'stroke-danger-solid',
}
