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
