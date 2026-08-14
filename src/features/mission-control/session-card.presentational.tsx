import type { FC } from 'react'
import { Loader2, Radio } from 'lucide-react'
import { formatSessionAttentionLabel } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { cn } from '@/shared/lib/cn.pure'
import type { SessionCard } from './mission-control.types'
import {
  ACTIVITY_TEXT_STYLES,
  CARD_ATTENTION_STYLES,
  STATUS_DOT_STYLES,
} from './session-card.styles'

interface SessionCardViewProps {
  card: SessionCard
  /** True while this card's Hail is the one open, so the room shows which. */
  hailOpen: boolean
  onOpen: (card: SessionCard) => void
  onHail: (card: SessionCard) => void
}

export const SessionCardView: FC<SessionCardViewProps> = ({
  card,
  hailOpen,
  onOpen,
  onHail,
}) => {
  const { session } = card
  const running = session.status === 'running'
  const needsYou = session.attention !== 'none'

  return (
    <div
      // The room measures card positions to open a Hail under the right row.
      data-session-card
      className={cn(
        'group flex flex-col rounded-lg border bg-card/40 transition-colors',
        CARD_ATTENTION_STYLES[session.attention],
        hailOpen && 'ring-1 ring-ring',
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${session.name}`}
        className="flex cursor-pointer flex-col gap-2 rounded-t-lg px-3 pt-3 pb-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => onOpen(card)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(card)
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {session.name}
          </span>
          {needsYou ? (
            <span
              className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
              title={formatSessionAttentionLabel(session)}
            >
              <SessionBadge attention={session.attention} />
              {formatSessionAttentionLabel(session)}
            </span>
          ) : (
            <span
              className={cn(
                'mt-1 size-2 shrink-0 rounded-full',
                STATUS_DOT_STYLES[session.status],
                running && 'animate-pulse',
              )}
              aria-hidden
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="truncate font-medium">{card.projectName}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{card.providerLabel}</span>
          {session.model ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{session.model}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
        <span
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-xs',
            ACTIVITY_TEXT_STYLES[session.status],
          )}
        >
          {running ? (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          ) : null}
          <span className="truncate">{card.activityLabel}</span>
        </span>

        <Button
          type="button"
          variant={hailOpen ? 'secondary' : 'ghost'}
          size="sm"
          className="h-6 shrink-0 px-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
          aria-expanded={hailOpen}
          aria-label={`Hail ${session.name}`}
          onClick={() => onHail(card)}
        >
          <Radio className="size-3" />
          Hail
        </Button>
      </div>
    </div>
  )
}
