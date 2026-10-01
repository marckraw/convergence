import type { FC } from 'react'
import { Search } from 'lucide-react'
import {
  Button,
  NO_DRAG_STYLE,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@convergence/ui'

interface SidebarSearchToggleProps {
  open: boolean
  onToggle: () => void
}

const SEARCH_CONVERSATIONS = 'Search conversations'

export const SidebarSearchToggle: FC<SidebarSearchToggleProps> = ({
  open,
  onToggle,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
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
    </TooltipTrigger>
    <TooltipContent side="bottom" style={NO_DRAG_STYLE}>
      {SEARCH_CONVERSATIONS}
    </TooltipContent>
  </Tooltip>
)
