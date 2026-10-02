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
import { Badge, Button, cn, StatusDot } from '@convergence/ui'
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
  /**
   * The seat holds a standing refusal (MAR-3118 lap 3, A): a refused value is
   * not re-sent on leave, so the closed row is where it must stay visible.
   */
  refused: boolean
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
  refused,
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
      data-seat-row
      data-seat-orphan={orphan || undefined}
      aria-label={seatRowAccessibleName({ member, source, host, refused })}
      onClick={onToggle}
      size="lg"
      className={cn(
        'flex w-full min-w-0 items-center justify-start rounded-md border bg-fill-quiet px-2.5 text-left font-normal transition-colors hover:border-hairline-strong text-xs py-0',
        // A seat whose conversation is gone is a heads-up: the warning tone.
        orphan ? 'border-warning-line' : 'border-hairline',
      )}
    >
      <KindGlyph
        aria-hidden
        className={cn(
          'size-3.5 shrink-0',
          orphan ? 'text-warning-ink' : 'text-ink-muted',
        )}
      />
      <span className="shrink-0 truncate text-xs font-medium">
        {seatDisplayName(member)}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-2xs',
          orphan ? 'text-warning-ink' : 'text-ink-muted',
        )}
      >
        {source}
      </span>
      <HostGlyph
        aria-hidden
        data-seat-host={hostIsLocal ? 'local' : 'remote'}
        className="size-3.5 shrink-0 text-ink-muted"
      >
        <title>{host}</title>
      </HostGlyph>
      {member.lanePolicy === 'main' ? (
        <GitCommitHorizontal
          aria-hidden
          data-seat-lane="main"
          className="size-3.5 shrink-0 text-ink-muted"
        >
          <title>{laneLabel(member.lanePolicy)}</title>
        </GitCommitHorizontal>
      ) : member.lanePolicy === 'own-worktree' ? (
        <GitBranch
          aria-hidden
          data-seat-lane="own-worktree"
          className="size-3.5 shrink-0 text-ink-muted"
        >
          <title>{laneLabel(member.lanePolicy)}</title>
        </GitBranch>
      ) : null}
      {/* The row's name says all three in words (seatRowAccessibleName);
          the WIP count, the card dot and the refusal mark are for the eye. */}
      <Badge aria-hidden shape="count" outline data-seat-wip="">
        {member.wipLimit}
      </Badge>
      <span
        aria-hidden
        data-card-dot={hasCard ? 'filled' : 'hollow'}
        className="flex"
      >
        {/* No card is a heads-up: a hollow dot in the warning solid. */}
        <StatusDot tone={hasCard ? 'neutral' : 'warning'} hollow={!hasCard} />
      </span>
      {refused ? (
        <Badge aria-hidden tone="danger" data-seat-refused="">
          !
        </Badge>
      ) : null}
      <ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
    </Button>
  )
}
