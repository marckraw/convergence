import type { FC } from 'react'
import type { Theme } from '@/shared/lib/theme'
import { Button } from '@/shared/ui/button'
import { Sun, Moon, Monitor } from 'lucide-react'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

export const ThemeToggle: FC<ThemeToggleProps> = ({ theme, onToggle }) => (
  <Button
    variant="ghost"
    size="icon"
    onClick={onToggle}
    className="h-8 w-8"
    title={`Theme: ${theme}`}
  >
    {theme === 'light' && <Sun className="h-4 w-4" />}
    {theme === 'dark' && <Moon className="h-4 w-4" />}
    {theme === 'system' && <Monitor className="h-4 w-4" />}
  </Button>
)
