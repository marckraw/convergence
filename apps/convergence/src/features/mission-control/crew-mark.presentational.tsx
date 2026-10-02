import type { FC } from 'react'
import { Users } from 'lucide-react'
import { Badge, cn } from '@convergence/ui'
import type { SessionCrew } from '@/entities/session-crew'
import { crewColor, crewHue } from './session-crew-picker.pure'

/** What a crew is drawn from: its name, its emoji and its colour. */
export type CrewMarkCrew = Pick<SessionCrew, 'name' | 'emoji' | 'accentColor'>

/**
 * - `chip`: the crew named on a card, washed in its colour (a Badge in the
 *   crew's hue).
 * - `glyph`: its emoji, or the people glyph when it has none.
 * - `dot`: its colour as a dot, beside its name; nothing when it has none.
 * - `swatch`: its colour as a small square, the slate swatch when it has none.
 */
export type CrewMarkVariant = 'chip' | 'glyph' | 'dot' | 'swatch'

interface CrewMarkProps {
  crew: CrewMarkCrew
  variant: CrewMarkVariant
  className?: string
}

/**
 * A crew's mark (MC-28): its emoji and its colour, drawn one way per job
 * instead of seven ways by hand. The colour is the crew's hue token
 * (`--crew-*`, R1's category hues), never the stored hex; a crew without a
 * colour or an emoji is plain, and its chip and glyph say so with the people
 * glyph rather than nothing.
 */
export const CrewMark: FC<CrewMarkProps> = ({ crew, variant, className }) => {
  if (variant === 'chip') {
    return (
      <Badge
        hue={crewHue(crew.accentColor)}
        icon={crew.emoji ? <span>{crew.emoji}</span> : undefined}
        className={className}
      >
        <span className="sr-only">In crew {crew.name}</span>
        <span aria-hidden>{crew.name}</span>
      </Badge>
    )
  }

  if (variant === 'glyph') {
    return crew.emoji ? (
      <span aria-hidden className={cn('leading-none', className)}>
        {crew.emoji}
      </span>
    ) : (
      <Users aria-hidden className={cn('size-3 shrink-0', className)} />
    )
  }

  const color = crewColor(crew.accentColor)
  if (variant === 'dot') {
    return color ? (
      <span
        aria-hidden
        style={{ backgroundColor: color }}
        className={cn('size-2 shrink-0 rounded-full', className)}
      />
    ) : null
  }

  return (
    <span
      aria-hidden
      style={{ backgroundColor: color ?? 'var(--crew-slate)' }}
      className={cn('size-3 shrink-0 rounded-sm', className)}
    />
  )
}
