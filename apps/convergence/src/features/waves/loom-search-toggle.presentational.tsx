import type { FC } from 'react'
import { Search } from 'lucide-react'
import { IconButton } from '@convergence/ui'
import { LOOM_SEARCH_NAME } from './loom-search.pure'
import {
  LOOM_SEARCH_GLYPH_CLASS,
  LOOM_SEARCH_TOGGLE_CLASS,
} from './wave-panel.styles'

/**
 * Compact's search icon (R7): reveals the field as its own row. It says
 * whether the row is drawn, so a screen reader hears what pressing it does.
 */
export const LoomSearchToggleView: FC<{
  revealed: boolean
  onToggle: () => void
}> = ({ revealed, onToggle }) => (
  <IconButton
    label={LOOM_SEARCH_NAME}
    type="button"
    variant="ghost"
    aria-expanded={revealed}
    onClick={onToggle}
    size="sm"
    className={LOOM_SEARCH_TOGGLE_CLASS}
  >
    <Search aria-hidden="true" className={LOOM_SEARCH_GLYPH_CLASS} />
  </IconButton>
)
