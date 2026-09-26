import { useState, useEffect, useCallback } from 'react'
import type { FC } from 'react'
import {
  type Theme,
  getStoredTheme,
  storeTheme,
  applyTheme,
} from '@/shared/lib/theme'
import { ThemeToggle } from './theme-toggle.presentational'

const CYCLE: Theme[] = ['dark', 'light', 'system']

export const ThemeToggleButton: FC = () => {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    // The toggle owns the live theme. App applies the stored theme once at
    // startup and never hears a later choice, so the OS subscription sits here:
    // one mounted toggle, dropped when the choice leaves System or this unmounts.
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]
      storeTheme(next)
      return next
    })
  }, [])

  return <ThemeToggle theme={theme} onToggle={toggle} />
}
