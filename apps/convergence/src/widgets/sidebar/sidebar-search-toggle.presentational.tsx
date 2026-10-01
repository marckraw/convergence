import type { FC } from 'react'
import { Search } from 'lucide-react'
import { IconButton } from '@convergence/ui'

interface SidebarSearchToggleProps {
  open: boolean
  onToggle: () => void
}

const SEARCH_CONVERSATIONS = 'Search conversations'

export const SidebarSearchToggle: FC<SidebarSearchToggleProps> = ({
  open,
  onToggle,
}) => (
  <IconButton
    label={SEARCH_CONVERSATIONS}
    type="button"
    variant={open ? 'tonal' : 'ghost'}
    aria-expanded={open}
    onClick={onToggle}
    tooltipSide="bottom"
  >
    <Search className="h-4 w-4" />
  </IconButton>
)
