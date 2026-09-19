import type { FC, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import type { LoomSheet } from './wave-panel-sheet.pure'
import {
  LOOM_SHEET_TITLE_CLASS,
  LOOM_SHEET_TITLE_OPEN_CLASS,
} from './wave-panel.styles'

interface LoomTitleViewProps {
  sheet: LoomSheet
  title: string
  open: boolean
  onSelect: () => void
  /** Only the OPEN title is held, for focus after a fold (R7). */
  titleRef?: (element: HTMLButtonElement | null) => void
  className?: string
  children?: ReactNode
}

/**
 * A sheet's title (MAR-3189 R1, R7): a button, in both of Loom's shapes.
 *
 * A button rather than a clickable row, because Enter and Space then open the
 * sheet without a single handler of ours, and a screen reader announces the
 * count together with the name and whether the sheet is open.
 */
export const LoomTitleView: FC<LoomTitleViewProps> = ({
  sheet,
  title,
  open,
  onSelect,
  titleRef,
  className,
  children,
}) => (
  <Button
    ref={open ? titleRef : undefined}
    type="button"
    variant="ghost"
    data-loom-sheet-title={sheet}
    aria-label={title}
    aria-expanded={open}
    aria-controls={open ? `loom-sheet-${sheet}` : undefined}
    className={cn(
      LOOM_SHEET_TITLE_CLASS,
      open && LOOM_SHEET_TITLE_OPEN_CLASS,
      className,
    )}
    onClick={onSelect}
  >
    {children ?? title}
  </Button>
)
