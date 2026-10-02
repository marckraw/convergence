import type { FC } from 'react'
import { cn, Toggle } from '@convergence/ui'
import { CrewMark } from './crew-mark.presentational'
import type { SessionCardCrewFacetOption } from './session-card-facets.pure'
import { crewHue } from './session-crew-picker.pure'
import { FILTER_CHIP_ROW_CLASS } from './session-filter.styles'

interface SessionCrewChipsProps {
  options: readonly SessionCardCrewFacetOption[]
  selected: readonly string[]
  onToggle: (id: string) => void
}

/**
 * Crew as the fifth filter dimension.
 *
 * Built like the state chips rather than like the project picker: crews are
 * few, named and coloured, so they are worth showing at a glance instead of
 * hiding behind a combobox. Each chip wears its crew's hue on its edge, the
 * hue token the crew's container border and its CrewMark chip paint with.
 */
export const SessionCrewChips: FC<SessionCrewChipsProps> = ({
  options,
  selected,
  onToggle,
}) => {
  if (options.length === 0) return null

  return (
    <div className={FILTER_CHIP_ROW_CLASS}>
      {options.map((option) => {
        const active = selected.includes(option.id)

        return (
          <Toggle
            key={option.id}
            variant="chip"
            size="sm"
            pressed={active}
            onPressedChange={() => onToggle(option.id)}
            // The crew's hue on the chip's edge, in Badge's crew mix (MC-28);
            // chosen, the raised chip every chip wears (R7, ruling 11).
            hue={crewHue(option.accentColor)}
            className={cn(
              'max-w-44',
              option.count === 0 && !active && 'opacity-50',
            )}
          >
            <CrewMark
              crew={{
                name: option.label,
                emoji: option.emoji,
                accentColor: option.accentColor,
              }}
              variant="glyph"
            />
            <span className="truncate">{option.label}</span>
            <span className="tabular-nums opacity-70">{option.count}</span>
          </Toggle>
        )
      })}
    </div>
  )
}
