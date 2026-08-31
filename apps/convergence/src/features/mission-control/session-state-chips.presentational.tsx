import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { STATE_CHIP_STYLES } from './session-card.styles'
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
  onClear: () => void
}

/**
 * The state chips: five multi-toggles that narrow the room to what Marcin
 * wants to see. None selected means the whole room — the default.
 */
export const SessionStateChips: FC<SessionStateChipsProps> = ({
  selected,
  counts,
  onToggle,
  onClear,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SESSION_CARD_STATES.map((state) => {
        const active = selected.includes(state)
        const count = counts[state]

        return (
          <Button
            key={state}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={active}
            onClick={() => onToggle(state)}
            className={cn(
              'h-7 gap-1.5 rounded-full border px-2.5 text-[11px] font-normal',
              active
                ? STATE_CHIP_STYLES[state]
                : 'border-white/10 text-muted-foreground hover:border-white/20',
              count === 0 && !active && 'opacity-50',
            )}
          >
            {formatSessionCardState(state)}
            <span className="tabular-nums opacity-70">{count}</span>
          </Button>
        )
      })}

      {selected.length > 0 ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onClear}
          className="h-7 px-2 text-[11px] font-normal text-muted-foreground hover:text-foreground"
        >
          Clear
        </Button>
      ) : null}
    </div>
  )
}
