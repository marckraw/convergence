import type { FC } from 'react'
import { SplitSquareHorizontal, SplitSquareVertical, X } from 'lucide-react'
import { IconButton } from '@convergence/ui'

interface PaneToolbarProps {
  onSplitHorizontal: () => void
  onSplitVertical: () => void
  onClose: () => void
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
        <SplitSquareHorizontal className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        label="Split vertical"
        type="button"
        variant="ghost"
        onClick={onSplitVertical}
        size="xs"
      >
        <SplitSquareVertical className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        label={closeLabel}
        type="button"
        variant="ghost"
        onClick={onClose}
        size="xs"
      >
        <X className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )
}
