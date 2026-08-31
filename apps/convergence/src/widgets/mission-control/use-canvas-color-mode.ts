import { useEffect, useState } from 'react'

/** What React Flow's `colorMode` prop accepts, narrowed to what we resolve. */
export type CanvasColorMode = 'light' | 'dark'

export function readAppliedColorMode(): CanvasColorMode {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * The theme the app is actually wearing, live.
 *
 * There is no theme store to subscribe to: the toggle keeps its choice in local
 * state and localStorage, and the only thing it publishes is the `dark` class
 * `applyTheme` puts on `<html>`. So this watches that class -- the same signal
 * every `dark:` utility in the app already obeys.
 *
 * Watching the applied class rather than the stored preference is also the more
 * honest reading: it resolves `system` for free, and it keeps the canvas in step
 * with the room even if the theme is later changed by something other than the
 * titlebar toggle.
 */
export function useCanvasColorMode(): CanvasColorMode {
  const [colorMode, setColorMode] =
    useState<CanvasColorMode>(readAppliedColorMode)

  useEffect(() => {
    const sync = () => {
      setColorMode((current) => {
        const next = readAppliedColorMode()
        return next === current ? current : next
      })
    }

    // Re-read on mount as well: the class can be written between the initial
    // state and this effect, and the room must never be half-themed.
    sync()

    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  return colorMode
}
