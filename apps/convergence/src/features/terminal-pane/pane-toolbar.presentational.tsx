import type { FC } from 'react'
import { SplitSquareHorizontal, SplitSquareVertical, X } from 'lucide-react'
import { IconButton } from '@convergence/ui'

interface PaneToolbarProps {
  onSplitHorizontal: () => void
  onSplitVertical: () => void
  /**
   * Closes the pane's open tab. Leave it out where each tab carries its own
   * close, as the terminal dock's tab strip does: a second ✕ for the same
   * tab is a duplicate (DS4).
   */
  onClose?: () => void
  closeLabel?: string
}

export const PaneToolbar: FC<PaneToolbarProps> = ({
  onSplitHorizontal,
  onSplitVertical,
  onClose,
  closeLabel = 'Close tab',
}) => {
  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        label="Split horizontal"
        type="button"
        variant="ghost"
        onClick={onSplitHorizontal}
        size="xs"
      >
        <SplitSquareHorizontal className="size-3.5" />
      </IconButton>
      <IconButton
        label="Split vertical"
        type="button"
        variant="ghost"
        onClick={onSplitVertical}
        size="xs"
      >
        <SplitSquareVertical className="size-3.5" />
      </IconButton>
      {onClose ? (
        <IconButton
          label={closeLabel}
          type="button"
          variant="ghost"
          onClick={onClose}
          size="xs"
        >
          <X className="size-3.5" />
        </IconButton>
      ) : null}
    </div>
  )
}
