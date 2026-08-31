import type { FC } from 'react'
import { SplitSquareHorizontal, SplitSquareVertical, X } from 'lucide-react'
import { Button } from '@/shared/ui/button'

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
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        aria-label="Split horizontal"
        title="Split horizontal"
        onClick={onSplitHorizontal}
      >
        <SplitSquareHorizontal className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        aria-label="Split vertical"
        title="Split vertical"
        onClick={onSplitVertical}
      >
        <SplitSquareVertical className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={onClose}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
