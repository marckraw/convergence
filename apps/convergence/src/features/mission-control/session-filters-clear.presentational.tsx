import type { FC } from 'react'
import { Button } from '@convergence/ui'
import { FILTER_CLEAR_CLASS } from './session-filter.styles'

interface SessionFiltersClearProps {
  onClear: () => void
}

/**
 * The filter row's one "Clear filters" (MC-7): after the chips and the
 * pickers, shown while any of them narrows the room, and clearing them all
 * at once. It replaced a "Clear" per chip group, two words for one act.
 */
export const SessionFiltersClear: FC<SessionFiltersClearProps> = ({
  onClear,
}) => (
  <Button
    type="button"
    variant="link"
    onClick={onClear}
    className={FILTER_CLEAR_CLASS}
  >
    Clear filters
  </Button>
)
