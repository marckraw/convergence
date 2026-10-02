import type { FC } from 'react'
import { Card, CardAction, cn, Timestamp, toneInk } from '@convergence/ui'
import { HISTORY_TONE, TONE_FRAME } from './hop-tone.styles'
import { ROW_CARD_DOOR_CLASS } from './row-card.styles'
import type { HistoryEventRow } from './run-history.pure'

interface HistoryEventRowViewProps {
  event: HistoryEventRow
  selected: boolean
  onSelect: () => void
}

/**
 * One recorded event, as a row in the list.
 *
 * **The reason is on the row**, never behind an expander (promise 4): a
 * failure nobody can see without clicking is one most people never read.
 */
export const HistoryEventRowView: FC<HistoryEventRowViewProps> = ({
  event,
  selected,
  onSelect,
}) => {
  const content = (
    <>
      <span className="flex w-full items-baseline gap-2">
        {/* To the second, as rows are scanned against their neighbours, in
            a <time> with the whole moment in its tooltip (MC-27). */}
        <Timestamp
          date={event.at}
          format="clock"
          seconds
          hour12={false}
          className="shrink-0 text-3xs text-ink-muted"
        />
        <span className="min-w-0 flex-1 whitespace-normal break-words text-xs">
          {event.title}
        </span>
        <span
          className={cn('shrink-0 text-2xs', toneInk[HISTORY_TONE[event.tone]])}
        >
          {event.outcomeLabel}
        </span>
      </span>
      {event.reason && (
        <span className="w-full whitespace-normal break-words text-3xs text-ink-muted">
          {event.reason}
        </span>
      )}
      {event.preview && (
        <span className="w-full whitespace-normal break-words text-3xs text-ink-muted">
          {event.preview}
        </span>
      )}
    </>
  )
  const frame = TONE_FRAME[HISTORY_TONE[event.tone]]
  // R7: the picked event is the selected row, the Card's fill and
  // aria-current (on its door, when it has one), kept under the pointer.
  return (
    <li>
      {event.kind === 'held-group' ? (
        <Card padding="none" selected={selected} className={frame}>
          <div className={ROW_CARD_DOOR_CLASS}>{content}</div>
        </Card>
      ) : (
        <Card interactive padding="none" selected={selected} className={frame}>
          <CardAction onClick={onSelect} className={ROW_CARD_DOOR_CLASS}>
            {content}
          </CardAction>
        </Card>
      )}
    </li>
  )
}
