import type { ThemeChoice } from '@convergence/ui'

/**
 * The app's side of the theme: where the choice is kept. Putting it on screen
 * is the design system's (`applyTheme` writes `data-theme` on `<html>`,
 * MAR-3615); this file remembers it between launches.
 */
export { applyTheme } from '@convergence/ui'

export type Theme = ThemeChoice

const STORAGE_KEY = 'convergence-theme'

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage not available
  }
  return 'dark'
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // localStorage not available
  }
}
