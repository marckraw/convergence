import type { FC } from 'react'
import { cn, Tooltip } from '@convergence/ui'
import type { ConversationItemTiming } from './transcript-entry.pure'

interface ConversationItemTimestampProps {
  createdAt: string
  timing: ConversationItemTiming
  className?: string
}

/**
 * When a transcript item happened, and how long it and its turn took. The
 * full date and what each figure means are our Tooltip, never a native title
 * (R2, CONV-5).
 */
export const ConversationItemTimestamp: FC<ConversationItemTimestampProps> = ({
  createdAt,
  timing,
  className,
}) => (
  <span
    className={cn(
      'inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs font-normal text-ink-muted/75',
      className,
    )}
    data-testid="conversation-item-timestamp"
  >
    <Tooltip label={timing.startedAtTitle ?? undefined}>
      <time dateTime={createdAt}>{timing.startedAtLabel}</time>
    </Tooltip>
    {timing.turnElapsedLabel && (
      <Tooltip label="Elapsed since this turn started">
        <span data-testid="conversation-item-turn-elapsed">
          {timing.turnElapsedLabel}
        </span>
      </Tooltip>
    )}
    {timing.activeDurationLabel && (
      <Tooltip label="Conversation item duration">
        <span data-testid="conversation-item-active-duration">
          {timing.activeDurationLabel}
        </span>
      </Tooltip>
    )}
  </span>
)
