/*
 * The eight colours a crew can wear (MAR-3617 DS4, R1's category hues), for
 * the code that can't read CSS: a crew stores its colour as one of these
 * hexes, so the hex is the key that finds its token. They mirror the --crew-*
 * tokens in tokens.css (the same value in both themes: a crew's colour is a
 * swatch someone picked), and mirrors.tokens.test.ts fails if the two drift
 * apart. Paint with the token (`var(--crew-violet)`, `hue="crew-violet"`),
 * never with the hex.
 */
export const crewTokens = {
  violet: '#7c3aed',
  blue: '#2563eb',
  cyan: '#06b6d4',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  pink: '#ec4899',
  /** Also the colour of a crew with none chosen. */
  slate: '#94a3b8',
} as const

/** A crew colour's name: `violet` is `--crew-violet`. */
export type CrewTokenName = keyof typeof crewTokens
