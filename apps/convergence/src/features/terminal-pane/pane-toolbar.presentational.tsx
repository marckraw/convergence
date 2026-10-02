import type { FC } from 'react'
import { SplitSquareHorizontal, SplitSquareVertical } from 'lucide-react'
import { IconButton } from '@convergence/ui'
import type { TerminalShortcutLabels } from '@/entities/terminal'

interface PaneToolbarProps {
  onSplitHorizontal: () => void
  onSplitVertical: () => void
  /** The keys the buttons answer to, in words, for their tooltips (NAV-23). */
  shortcuts?: TerminalShortcutLabels
}

/**
 * A pane's two splits. It has no close: each tab carries its own ✕, which
 * says ⌘W (DS4, NAV N4), so a second one here was a duplicate no caller drew.
 */
export const PaneToolbar: FC<PaneToolbarProps> = ({
  onSplitHorizontal,
  onSplitVertical,
  shortcuts,
}) => {
  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        label="Split horizontal"
        shortcut={shortcuts?.['split-horizontal']}
        type="button"
        variant="ghost"
        onClick={onSplitHorizontal}
        size="xs"
      >
        <SplitSquareHorizontal className="size-3.5" />
      </IconButton>
      <IconButton
        label="Split vertical"
        shortcut={shortcuts?.['split-vertical']}
        type="button"
        variant="ghost"
        onClick={onSplitVertical}
        size="xs"
      >
        <SplitSquareVertical className="size-3.5" />
      </IconButton>
    </div>
  )
}
