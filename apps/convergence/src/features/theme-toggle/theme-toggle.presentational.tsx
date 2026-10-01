import type { FC } from 'react'
import type { Theme } from '@/shared/lib/theme'
import { IconButton, type TooltipSide } from '@convergence/ui'
import { Sun, Moon, Monitor } from 'lucide-react'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
  /** Where its tooltip shows: the rail's open to the right (NAV-17). */
  tooltipSide?: TooltipSide
}

export const ThemeToggle: FC<ThemeToggleProps> = ({
  theme,
  onToggle,
  tooltipSide,
}) => (
  <IconButton
    label={`Theme: ${theme}`}
    variant="ghost"
    onClick={onToggle}
    tooltipSide={tooltipSide}
  >
    {theme === 'light' && <Sun className="h-4 w-4" />}
    {theme === 'dark' && <Moon className="h-4 w-4" />}
    {theme === 'system' && <Monitor className="h-4 w-4" />}
  </IconButton>
)
