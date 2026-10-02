import type { FC } from 'react'
import { PanelLeftClose } from 'lucide-react'
import { IconButton } from '@convergence/ui'
import { LOOM_COLLAPSE_BUTTON_CLASS } from './wave-panel.styles'

/** One string for Collapse's name and its tooltip (MAR-3311 R1). */
const COLLAPSE_LOOM = 'Collapse Loom'

/**
 * Collapse, the same control at the end of both of Loom's headers (MC-35).
 *
 * Icon-only, and named apart from the controls beside it (MAR-3292 R4):
 * "Expand Loom" goes wider, "Fold Loom" in the expanded header comes back to
 * the column, and "Collapse Loom" takes the column away altogether. Being
 * icon-only, its name is its tooltip. `app-no-drag` is the IconButton's own,
 * so in the expanded header's drag strip it stays a control rather than a
 * place to pick the window up.
 */
export const LoomCollapseButton: FC<{ onCollapse: () => void }> = ({
  onCollapse,
}) => (
  <IconButton
    label={COLLAPSE_LOOM}
    type="button"
    variant="ghost"
    onClick={onCollapse}
    tooltipSide="bottom"
    size="sm"
    className={LOOM_COLLAPSE_BUTTON_CLASS}
  >
    <PanelLeftClose className="size-3.5" />
  </IconButton>
)
