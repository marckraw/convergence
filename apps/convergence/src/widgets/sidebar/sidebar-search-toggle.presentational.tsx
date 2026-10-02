import type { FC } from 'react'
import { Search } from 'lucide-react'
import { IconButton } from '@convergence/ui'

interface SidebarSearchToggleProps {
  open: boolean
  onToggle: () => void
  /** Its key, already formatted ("⌘F"), shown in the tooltip (NAV-23). */
  shortcut?: string
}

const SEARCH_CONVERSATIONS = 'Search conversations'

export const SidebarSearchToggle: FC<SidebarSearchToggleProps> = ({
  open,
  onToggle,
  shortcut,
}) => (
  <IconButton
    label={SEARCH_CONVERSATIONS}
    shortcut={shortcut}
    type="button"
    variant="ghost"
    // On while the field shows: R7's raised chip, which pressed draws
    // (DS-28), never a variant swapped in.
    pressed={open}
    onClick={onToggle}
    tooltipSide="bottom"
    // R3: the header's 28 px (NAV-6).
    size="sm"
  >
    <Search className="h-4 w-4" />
  </IconButton>
)
