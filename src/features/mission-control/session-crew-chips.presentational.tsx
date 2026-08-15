import type { CSSProperties, FC } from 'react'
import { Users } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import type { SessionCardCrewFacetOption } from './session-card-facets.pure'

interface SessionCrewChipsProps {
  options: readonly SessionCardCrewFacetOption[]
  selected: readonly string[]
  onToggle: (id: string) => void
  onClear: () => void
}

/** The accent tint an active chip wears, mixed down so text stays readable. */
function accentStyle(
  accentColor: string | null,
  active: boolean,
): CSSProperties | undefined {
  if (!accentColor) return undefined
  return active
    ? {
        borderColor: accentColor,
        backgroundColor: `color-mix(in srgb, ${accentColor} 22%, transparent)`,
      }
    : { borderColor: `color-mix(in srgb, ${accentColor} 45%, transparent)` }
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
  onClear,
}) => {
  if (options.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const active = selected.includes(option.id)

        return (
          <Button
            key={option.id}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={active}
            onClick={() => onToggle(option.id)}
            style={accentStyle(option.accentColor, active)}
            className={cn(
              'h-7 max-w-44 gap-1.5 rounded-full border px-2.5 text-[11px] font-normal',
              active
                ? 'text-foreground'
                : 'border-white/10 text-muted-foreground hover:border-white/20',
              option.count === 0 && !active && 'opacity-50',
            )}
          >
            {option.emoji ? (
              <span aria-hidden className="leading-none">
                {option.emoji}
              </span>
            ) : (
              <Users className="size-3" />
            )}
            <span className="truncate">{option.label}</span>
            <span className="tabular-nums opacity-70">{option.count}</span>
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
