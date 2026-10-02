import type { FC } from 'react'
import { PanelBottomClose, PanelLeftClose, PanelRightClose } from 'lucide-react'
import type { DockPlacement } from '@/entities/terminal'
import { IconButton } from '@convergence/ui'

/** The glyph shows the dock folding away to the edge it sits on. */
const GLYPHS = {
  bottom: PanelBottomClose,
  left: PanelLeftClose,
  right: PanelRightClose,
} as const

interface HideDockButtonProps {
  /** Where the dock sits, so the glyph folds it toward that edge. */
  placement: DockPlacement
  /** The key that does the same, in words ("⌘`"), for its tooltip (NAV-23). */
  shortcut?: string
  onHide: () => void
}

/**
 * The dock's Hide terminal: puts the dock away, as ⌘` does, and leaves its
 * terminals running. The header's Project › Close terminal is the other
 * control, and the one that ends them; this one never does.
 */
export const HideDockButton: FC<HideDockButtonProps> = ({
  placement,
  shortcut,
  onHide,
}) => {
  const Glyph = GLYPHS[placement]
  return (
    <IconButton
      label="Hide terminal"
      shortcut={shortcut}
      type="button"
      variant="ghost"
      onClick={onHide}
      size="xs"
    >
      <Glyph className="size-3.5" />
    </IconButton>
  )
}
