import type { CSSProperties, FC } from 'react'
import { cn, Toggle } from '@convergence/ui'
import { CrewMark } from './crew-mark.presentational'
import type { SessionCardCrewFacetOption } from './session-card-facets.pure'
import { crewColor } from './session-crew-picker.pure'
import { FILTER_CHIP_ROW_CLASS } from './session-filter.styles'

interface SessionCrewChipsProps {
  options: readonly SessionCardCrewFacetOption[]
  selected: readonly string[]
  onToggle: (id: string) => void
}

/**
 * The crew's colour on its chip, from its hue token, mixed down so the words
 * stay readable: its edge at rest, its edge and a wash once pressed.
 */
function accentStyle(
  accentColor: string | null,
  active: boolean,
): CSSProperties | undefined {
  const color = crewColor(accentColor)
  if (!color) return undefined
  return active
    ? {
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)`,
      }
    : { borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }
}

/**
 * Crew as the fifth filter dimension.
 *
 * Built like the state chips rather than like the project picker: crews are
 * few, named and coloured, so they are worth showing at a glance instead of
 * hiding behind a combobox. Each chip wears its crew's accent, which is the
 * same colour the crew's container border uses.
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
            style={accentStyle(option.accentColor, active)}
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
