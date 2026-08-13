import type { FC } from 'react'
import { Loader2 } from 'lucide-react'
import { formatSessionAttentionLabel } from '@/entities/session'
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
  onOpen: (card: SessionCard) => void
}

export const SessionCardView: FC<SessionCardViewProps> = ({ card, onOpen }) => {
  const { session } = card
  const running = session.status === 'running'
  const needsYou = session.attention !== 'none'

  return (
    <div
      className={cn(
        'group flex flex-col rounded-lg border bg-card/40 transition-colors',
        CARD_ATTENTION_STYLES[session.attention],
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
      </div>
    </div>
  )
}
