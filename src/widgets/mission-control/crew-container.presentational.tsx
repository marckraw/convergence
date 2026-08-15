import type { CSSProperties, FC, ReactNode } from 'react'
import { Users } from 'lucide-react'
import { formatCrewMemberCount } from '@/features/mission-control'
import { cn } from '@/shared/lib/cn.pure'

interface CrewContainerProps {
  name: string
  emoji: string | null
  /** Drives the border and the header dot. Null keeps the room's own line. */
  accentColor: string | null
  /** Members before the filter narrowed the room. */
  memberCount: number
  /** Cards actually rendered inside. */
  visibleCount: number
  /** The trailing catch-all rather than a real crew. */
  loose?: boolean
  /** Rename/decorate/delete, composed above so this file stays render-only. */
  menu?: ReactNode
  children: ReactNode
}

/**
 * One bordered crew container: decoration, name, member count, cards inside.
 *
 * A crew whose members the filter removed is dimmed rather than hidden — the
 * room stays the same shape while it is being narrowed, so a crew never
 * disappears out from under the eye that was looking at it.
 */
export const CrewContainer: FC<CrewContainerProps> = ({
  name,
  emoji,
  accentColor,
  memberCount,
  visibleCount,
  loose = false,
  menu,
  children,
}) => {
  const filteredOut = memberCount > 0 && visibleCount === 0
  const accentStyle: CSSProperties | undefined = accentColor
    ? { borderColor: accentColor }
    : undefined

  return (
    <section
      data-crew-container
      style={accentStyle}
      className={cn(
        'rounded-lg border transition-opacity',
        loose ? 'border-dashed border-white/10' : 'border-white/15',
        filteredOut && 'opacity-40',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
        {emoji ? (
          <span aria-hidden className="text-sm leading-none">
            {emoji}
          </span>
        ) : (
          <Users className="size-3.5 text-muted-foreground" />
        )}

        {accentColor ? (
          <span
            aria-hidden
            style={{ backgroundColor: accentColor }}
            className="size-2 rounded-full"
          />
        ) : null}

        <h2 className="truncate text-xs font-medium">{name}</h2>

        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatCrewMemberCount(memberCount)}
          {filteredOut ? ' · filtered out' : null}
        </span>

        {menu ? <div className="ml-auto">{menu}</div> : null}
      </div>

      <div className="px-4 py-3">
        {memberCount === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No sessions in this crew yet.
          </p>
        ) : filteredOut ? (
          <p className="text-[11px] text-muted-foreground">
            Every session here is filtered out of the room right now.
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
