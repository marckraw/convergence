/**
 * The theme switch (MAR-3615 DS2): `data-theme` on `<html>`, which
 * `tokens.css` turns into `color-scheme`, and every token's `light-dark()`
 * follows that.
 *
 * `applyTheme` always writes the resolved theme, System included, so there is
 * one truth on screen for the CSS and for the code that can't read CSS (React
 * Flow's `colorMode`, Mermaid's theme): `readAppliedTheme` reads it back. With
 * no attribute (Storybook, a test, the moment before JS runs) the system
 * decides, in the CSS and here alike.
 */

/** What a person picks: one of the two themes, or whatever macOS is wearing. */
export type ThemeChoice = 'light' | 'dark' | 'system'

/** What is on screen: the value of `data-theme` on `<html>`. */
export type AppliedTheme = 'light' | 'dark'

export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

/** Whether the system is dark now; false where there is no `matchMedia`. */
export function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DARK_SCHEME_QUERY).matches
  )
}

/** The theme a choice puts on screen: System is resolved against the system now. */
export function resolveTheme(choice: ThemeChoice): AppliedTheme {
  if (choice !== 'system') return choice
  return systemPrefersDark() ? 'dark' : 'light'
}

/**
 * Puts a choice on screen. While System is chosen the caller re-applies it
 * when the system changes (the theme toggle subscribes, MAR-3464).
 */
export function applyTheme(
  choice: ThemeChoice,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = resolveTheme(choice)
}

/** The theme on screen: `data-theme`, or the system's when there is none. */
export function readAppliedTheme(
  root: HTMLElement = document.documentElement,
): AppliedTheme {
  const theme = root.dataset.theme
  if (theme === 'light' || theme === 'dark') return theme
  return systemPrefersDark() ? 'dark' : 'light'
}
