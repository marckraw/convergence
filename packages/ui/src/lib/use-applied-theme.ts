import { useEffect, useState } from 'react'
import { DARK_SCHEME_QUERY, readAppliedTheme, type AppliedTheme } from './theme'

/**
 * The theme on screen, live, for code that can't read CSS: React Flow's
 * `colorMode`, Mermaid's theme, a chart reading a colour.
 *
 * There is no theme store to subscribe to: the toggle keeps its choice in
 * local state and localStorage, and what it publishes is `data-theme` on
 * `<html>`. So this watches that attribute, the same signal every token
 * already follows. It resolves System for free, and stays in step even if
 * something other than the toggle changes the theme. With no attribute it
 * follows the system, as the CSS does.
 */
export function useAppliedTheme(): AppliedTheme {
  const [theme, setTheme] = useState<AppliedTheme>(() =>
    typeof document === 'undefined' ? 'dark' : readAppliedTheme(),
  )

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setTheme(readAppliedTheme(root))

    // Re-read on mount as well: the attribute can be written between the
    // initial state and this effect, and a surface must never be half-themed.
    sync()

    const observer = new MutationObserver(sync)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(DARK_SCHEME_QUERY)
        : null
    media?.addEventListener('change', sync)

    return () => {
      observer.disconnect()
      media?.removeEventListener('change', sync)
    }
  }, [])

  return theme
}
