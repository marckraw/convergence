import type { FC } from 'react'
import { cn, Toggle } from '@convergence/ui'
import {
  FILTER_CHIP_ROW_CLASS,
  STATE_CHIP_PRESSED,
} from './session-filter.styles'
import {
  SESSION_CARD_STATES,
  formatSessionCardState,
} from './session-card-state.pure'
import type {
  SessionCardState,
  SessionCardStateCounts,
} from './session-card-state.pure'

interface SessionStateChipsProps {
  selected: readonly SessionCardState[]
  counts: SessionCardStateCounts
  onToggle: (state: SessionCardState) => void
}

/**
 * The state chips: five multi-toggles that narrow the room to what Marcin
 * wants to see. None selected means the whole room — the default. The row's
 * one "Clear filters" clears them with the rest (MC-7).
 */
export const SessionStateChips: FC<SessionStateChipsProps> = ({
  selected,
  counts,
  onToggle,
}) => {
  return (
    <div className={FILTER_CHIP_ROW_CLASS}>
      {SESSION_CARD_STATES.map((state) => {
        const active = selected.includes(state)
        const count = counts[state]

        return (
          <Toggle
            key={state}
            variant="chip"
            size="sm"
            pressed={active}
            onPressedChange={() => onToggle(state)}
            className={cn(
              STATE_CHIP_PRESSED[state],
              count === 0 && !active && 'opacity-50',
            )}
          >
            {formatSessionCardState(state)}
            <span className="tabular-nums opacity-70">{count}</span>
          </Toggle>
        )
      })}
    </div>
  )
}
