import type { FC } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import type { WaveRow } from './wave-sections.pure'
import {
  WAVE_ROW_ACTION_CLASS,
  WAVE_ROW_CLASS,
  WAVE_ROW_META_CLASS,
  WAVE_ROW_OPENABLE_CLASS,
} from './wave-panel.styles'

interface WaveRowViewProps {
  row: WaveRow
  /** Why the row cannot open its seat, or null when it can. */
  inertReason: string | null
  onOpen: (entry: WorkLedgerEntry) => void
}

/**
 * One issue on the panel (R2): identifier, title, seat, state, PR and the
 * human action -- the ledger's facts, nothing invented. A row with a
 * reachable conversation is a button; one without says why it is inert.
 */
export const WaveRowView: FC<WaveRowViewProps> = ({
  row,
  inertReason,
  onOpen,
}) => {
  const { entry, action } = row
  const body = (
    <>
      <span className="flex items-baseline gap-1.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          {entry.issueIdentifier}
        </span>
        <span className="truncate">{entry.issueTitle}</span>
      </span>
      <span className={WAVE_ROW_META_CLASS}>
        {[
          entry.seat ?? 'no seat',
          entry.state,
          entry.pr ? `PR #${entry.pr.number} ${entry.pr.state}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {action ? <span className={WAVE_ROW_ACTION_CLASS}>{action}</span> : null}
      {inertReason ? (
        <span className={WAVE_ROW_META_CLASS}>{inertReason}</span>
      ) : null}
    </>
  )

  return inertReason === null ? (
    <Button
      type="button"
      variant="ghost"
      data-wave-row={entry.issueIdentifier}
      className={cn(WAVE_ROW_CLASS, WAVE_ROW_OPENABLE_CLASS)}
      onClick={() => onOpen(entry)}
    >
      {body}
    </Button>
  ) : (
    <div
      data-wave-row={entry.issueIdentifier}
      aria-disabled="true"
      className={WAVE_ROW_CLASS}
    >
      {body}
    </div>
  )
}
