import type { FC } from 'react'
import type { Theme } from '@/shared/lib/theme'
import { type ButtonSize, IconButton, type TooltipSide } from '@convergence/ui'
import { Sun, Moon, Monitor } from 'lucide-react'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
  /** Where its tooltip shows: the rail's open to the right (NAV-17). */
  tooltipSide?: TooltipSide
  /** R3: 28 px in a header, 32 on the rail (NAV-6). */
  size?: ButtonSize
}

/** What each theme is called under the action: the tooltip's second line and the description. */
const THEME_NAMES: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

export const ThemeToggle: FC<ThemeToggleProps> = ({
  theme,
  onToggle,
  tooltipSide,
  size = 'md',
}) => (
  // Named for what it does, the theme it is on under it (NAV-6).
  <IconButton
    label="Change theme"
    tooltipDetail={`Now: ${THEME_NAMES[theme]}`}
    aria-description={`Now: ${THEME_NAMES[theme]}`}
    variant="ghost"
    onClick={onToggle}
    tooltipSide={tooltipSide}
    size={size}
  >
    {theme === 'light' && <Sun className="h-4 w-4" />}
    {theme === 'dark' && <Moon className="h-4 w-4" />}
    {theme === 'system' && <Monitor className="h-4 w-4" />}
  </IconButton>
)
