import type { FC } from 'react'
import type { Theme } from '@/shared/lib/theme'
import { IconButton } from '@convergence/ui'
import { Sun, Moon, Monitor } from 'lucide-react'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

export const ThemeToggle: FC<ThemeToggleProps> = ({ theme, onToggle }) => (
  <IconButton label={`Theme: ${theme}`} variant="ghost" onClick={onToggle}>
    {theme === 'light' && <Sun className="h-4 w-4" />}
    {theme === 'dark' && <Moon className="h-4 w-4" />}
    {theme === 'system' && <Monitor className="h-4 w-4" />}
  </IconButton>
)
