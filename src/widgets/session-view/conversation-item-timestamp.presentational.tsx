import type { FC } from 'react'
import type { ConversationItemTiming } from './transcript-entry.pure'

interface ConversationItemTimestampProps {
  createdAt: string
  timing: ConversationItemTiming
  className?: string
}

export const ConversationItemTimestamp: FC<ConversationItemTimestampProps> = ({
  createdAt,
  timing,
  className,
}) => (
  <span
    className={[
      'inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-normal text-muted-foreground/75',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    data-testid="conversation-item-timestamp"
  >
    <time dateTime={createdAt} title={timing.startedAtTitle}>
      {timing.startedAtLabel}
    </time>
    {timing.turnElapsedLabel && (
      <span
        title="Elapsed since this turn started"
        data-testid="conversation-item-turn-elapsed"
      >
        {timing.turnElapsedLabel}
      </span>
    )}
    {timing.activeDurationLabel && (
      <span
        title="Conversation item duration"
        data-testid="conversation-item-active-duration"
      >
        {timing.activeDurationLabel}
      </span>
    )}
  </span>
)
