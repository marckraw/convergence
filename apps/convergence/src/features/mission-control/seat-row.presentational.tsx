import type { FC } from 'react'
import {
  ChevronRight,
  FlaskConical,
  GitBranch,
  GitCommitHorizontal,
  Laptop,
  MessageSquare,
  Server,
  Unlink,
} from 'lucide-react'
import type { SessionCrewMember } from '@/entities/session-crew'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import {
  laneLabel,
  seatDisplayName,
  seatRowAccessibleName,
} from './seat-display.pure'

interface SeatRowProps {
  member: SessionCrewMember
  /** The conversation's title, `recipe · <model>`, or "conversation gone". */
  source: string
  host: string
  hostIsLocal: boolean
  onToggle: () => void
}

/**
 * One seat, closed: identifiable without opening it (MAR-3118 R1).
 *
 * kind glyph · baton name · source · host glyph · lane glyph · WIP · card dot.
 * Every one of those is also in the button's accessible name, because a glyph
 * alone is a fact only sighted people have.
 */
export const SeatRow: FC<SeatRowProps> = ({
  member,
  source,
  host,
  hostIsLocal,
  onToggle,
}) => {
  const orphan = member.conversationMissing
  const recipe = member.sessionId === null
  const KindGlyph = orphan ? Unlink : recipe ? FlaskConical : MessageSquare
  const HostGlyph = hostIsLocal ? Laptop : Server
  const hasCard = Boolean(member.roleCard)
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-seat-row
      aria-label={seatRowAccessibleName({ member, source, host })}
      onClick={onToggle}
      className={cn(
        'flex h-9 w-full min-w-0 items-center justify-start gap-2 rounded-md border bg-white/[0.02] px-2.5 text-left font-normal transition-colors hover:border-white/20',
        orphan ? 'border-amber-500/50' : 'border-white/10',
      )}
    >
      <KindGlyph
        aria-hidden
        className={cn(
          'size-3.5 shrink-0',
          orphan ? 'text-amber-400' : 'text-muted-foreground',
        )}
      />
      <span className="shrink-0 truncate text-xs font-medium">
        {seatDisplayName(member)}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[11px]',
          orphan ? 'text-amber-400' : 'text-muted-foreground',
        )}
      >
        {source}
      </span>
      <HostGlyph
        aria-hidden
        data-seat-host={hostIsLocal ? 'local' : 'remote'}
        className="size-3.5 shrink-0 text-muted-foreground"
      >
        <title>{host}</title>
      </HostGlyph>
      {member.lanePolicy === 'main' ? (
        <GitCommitHorizontal
          aria-hidden
          data-seat-lane="main"
          className="size-3.5 shrink-0 text-muted-foreground"
        >
          <title>{laneLabel(member.lanePolicy)}</title>
        </GitCommitHorizontal>
      ) : member.lanePolicy === 'own-worktree' ? (
        <GitBranch
          aria-hidden
          data-seat-lane="own-worktree"
          className="size-3.5 shrink-0 text-muted-foreground"
        >
          <title>{laneLabel(member.lanePolicy)}</title>
        </GitBranch>
      ) : null}
      <span
        aria-hidden
        data-seat-wip
        className="shrink-0 rounded border border-white/15 px-1 text-[10px] leading-4 text-muted-foreground"
      >
        {member.wipLimit}
      </span>
      <span
        aria-hidden
        data-card-dot={hasCard ? 'filled' : 'hollow'}
        className={cn(
          'size-2 shrink-0 rounded-full',
          hasCard ? 'bg-foreground/80' : 'border border-amber-400',
        )}
      />
      <ChevronRight
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground"
      />
    </Button>
  )
}
