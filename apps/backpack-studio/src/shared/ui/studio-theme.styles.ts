/**
 * Studio's few visual constants (MAR-2770).
 *
 * Deliberately small. Backpack is the design system this app is named after and
 * will eventually be dressed in (constitution law 10); until that beat, hard
 * values in one file are honest scaffolding, and scattering them through the
 * components would make the eventual swap a search-and-replace instead of an
 * import.
 */
export const studioTheme = {
  canvas: '#0f1115',
  panel: '#161a21',
  panelRaised: '#1c212a',
  border: '#262d38',
  text: '#e6e9ef',
  textMuted: '#98a2b3',
  accent: '#5aa9ff',
  danger: '#ff6b6b',
  radius: '10px',
  font: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const
