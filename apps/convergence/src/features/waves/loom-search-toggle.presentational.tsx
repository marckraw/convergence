import type { FC } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/shared/ui/button'
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
  <Button
    type="button"
    variant="ghost"
    size="icon"
    aria-label={LOOM_SEARCH_NAME}
    aria-expanded={revealed}
    className={LOOM_SEARCH_TOGGLE_CLASS}
    onClick={onToggle}
  >
    <Search aria-hidden="true" className={LOOM_SEARCH_GLYPH_CLASS} />
  </Button>
)
