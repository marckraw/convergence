import { useLiveConversationUpdatedAt } from '@/entities/session'
import type { FC } from 'react'
import { Clock } from 'lucide-react'
import {
  extendConversationTotalMs,
  formatConversationDurationMs,
  type StreamingDurationTarget,
} from './conversation-total-duration.pure'
import { SessionHeaderDetailRow } from './session-header-detail-row.presentational'

/**
 * Elapsed while a reply streams (MAR-3310 F1g). The list-change reading is
 * computed by the parent; this row alone subscribes, so an append does not
 * re-render the session view or the transcript.
 */
export const SessionElapsedDuration: FC<
  StreamingDurationTarget & { label: string | null }
> = ({ label, totalMs, streamingItem, turnSpan }) => {
  const liveUpdatedAt = useLiveConversationUpdatedAt(streamingItem)
  const value =
    streamingItem === null
      ? label
      : formatConversationDurationMs(
          extendConversationTotalMs(totalMs, turnSpan, liveUpdatedAt),
        )
  if (!value) return null
  return (
    <SessionHeaderDetailRow
      icon={<Clock className="h-3.5 w-3.5" />}
      label="Agent working time"
      value={value}
      testId="session-total-duration"
    />
  )
}
