import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import type { HistoryEventRow, HistoryTone } from './run-history.pure'

/** One tone, one colour. Unknown is neutral: red is for what we understand. */
export const HISTORY_TONE_TEXT: Record<HistoryTone, string> = {
  delivered: 'text-emerald-400',
  held: 'text-muted-foreground',
  alarm: 'text-red-400',
  terminal: 'text-amber-400',
  unknown: 'text-muted-foreground',
}

export const HISTORY_TONE_BORDER: Record<HistoryTone, string> = {
  delivered: 'border-emerald-500/40',
  held: 'border-white/10',
  alarm: 'border-red-500/40',
  terminal: 'border-amber-500/40',
  unknown: 'border-white/10',
}

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
}) => (
  <li>
    <Button
      type="button"
      variant="ghost"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex h-auto w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left font-normal',
        HISTORY_TONE_BORDER[event.tone],
        selected && 'bg-white/[0.06]',
      )}
    >
      <span className="flex w-full items-baseline gap-2">
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
          {event.timeLabel}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px]">
          {event.title}
        </span>
        <span
          className={cn('shrink-0 text-[11px]', HISTORY_TONE_TEXT[event.tone])}
        >
          {event.outcomeLabel}
        </span>
      </span>
      {event.reason ? (
        <span className="w-full truncate text-[10px] text-muted-foreground">
          {event.reason}
        </span>
      ) : null}
    </Button>
  </li>
)
