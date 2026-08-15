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
  /**
   * The crew's relays. Sits under the header and above the cards, and stays
   * visible when the filter empties the room -- a wire you cannot see is a
   * wire you cannot switch off.
   */
  flow?: ReactNode
  /**
   * A relay in this crew errored or burned its hop budget. Outlines the whole
   * container in red: a loop that had to be stopped by force must be findable
   * from across the room, not only by opening the trail.
   */
  alarm?: boolean
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
  flow,
  alarm = false,
  children,
}) => {
  const filteredOut = memberCount > 0 && visibleCount === 0
  // An alarm outranks the crew's own colour: the accent is decoration, the red
  // is news.
  const accentStyle: CSSProperties | undefined =
    accentColor && !alarm ? { borderColor: accentColor } : undefined

  return (
    <section
      data-crew-container
      data-crew-alarm={alarm ? 'true' : undefined}
      style={accentStyle}
      className={cn(
        'rounded-lg border transition-opacity',
        loose ? 'border-dashed border-white/10' : 'border-white/15',
        alarm && 'border-red-500/60 ring-1 ring-red-500/20',
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

      {flow}

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
