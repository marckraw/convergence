import type { FC } from 'react'
import { Search } from 'lucide-react'
import { Button, Tooltip } from '@convergence/ui'

interface SidebarSearchToggleProps {
  open: boolean
  onToggle: () => void
}

const SEARCH_CONVERSATIONS = 'Search conversations'

export const SidebarSearchToggle: FC<SidebarSearchToggleProps> = ({
  open,
  onToggle,
}) => (
  <Tooltip label={SEARCH_CONVERSATIONS} side="bottom">
    <Button
      type="button"
      variant={open ? 'secondary' : 'ghost'}
      size="icon"
      className="h-8 w-8"
      aria-label={SEARCH_CONVERSATIONS}
      aria-expanded={open}
      onClick={onToggle}
    >
      <Search className="h-4 w-4" />
    </Button>
  </Tooltip>
)
