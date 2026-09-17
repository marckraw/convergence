import type { FC } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { waveRowKey, type WaveRow } from './wave-sections.pure'
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
 * One issue on the panel (R2): identifier, title, crew (when several are
 * bound), seat, state, PR, the human action and a host outage marker -- the
 * ledger's facts, nothing invented. A row with a reachable conversation is a
 * button; one without says why it is inert.
 */
export const WaveRowView: FC<WaveRowViewProps> = ({
  row,
  inertReason,
  onOpen,
}) => {
  const { entry, action, hostMarker, crewName, lapLabel } = row
  const key = waveRowKey(entry)
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
          crewName,
          entry.seat ?? 'no seat',
          entry.state,
          // Which lap, against the crew's cap, and the ruling that set it
          // (MAR-3085 R7).
          lapLabel,
          entry.verdict,
          entry.pr ? `PR #${entry.pr.number} ${entry.pr.state}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {action ? <span className={WAVE_ROW_ACTION_CLASS}>{action}</span> : null}
      {hostMarker ? (
        <span className={WAVE_ROW_ACTION_CLASS}>{hostMarker}</span>
      ) : null}
      {inertReason ? (
        <span className={WAVE_ROW_META_CLASS}>{inertReason}</span>
      ) : null}
    </>
  )

  return inertReason === null ? (
    <Button
      type="button"
      variant="ghost"
      data-wave-row={key}
      className={cn(WAVE_ROW_CLASS, WAVE_ROW_OPENABLE_CLASS)}
      onClick={() => onOpen(entry)}
    >
      {body}
    </Button>
  ) : (
    <div data-wave-row={key} aria-disabled="true" className={WAVE_ROW_CLASS}>
      {body}
    </div>
  )
}
