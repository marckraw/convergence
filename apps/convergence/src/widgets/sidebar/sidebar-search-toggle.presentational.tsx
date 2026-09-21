import type { FC } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/shared/ui/button'

interface SidebarSearchToggleProps {
  open: boolean
  onToggle: () => void
}

export const SidebarSearchToggle: FC<SidebarSearchToggleProps> = ({
  open,
  onToggle,
}) => (
  <Button
    type="button"
    variant={open ? 'secondary' : 'ghost'}
    size="icon"
    className="h-8 w-8"
    title="Search conversations"
    aria-label="Search conversations"
    aria-expanded={open}
    onClick={onToggle}
  >
    <Search className="h-4 w-4" />
  </Button>
)
