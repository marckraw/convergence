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
 * bound), seat, state, PR, the human action, the `blocked` label and a host
 * outage marker -- the ledger's facts, nothing invented. A row with a
 * reachable conversation is a button; one without says why it is inert.
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
      <span className="flex w-full items-baseline gap-1.5">
        {/* One unbreakable token (MAR-3155 R5): at the old fixed width
            `MAR-3085` wrapped after the dash, which is the one thing a row
            exists to say. It never shrinks; the title takes what is left. */}
        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          {entry.issueIdentifier}
        </span>
        {/* Two lines rather than one cut short, and the whole title one hover
            away -- `min-w-0` so the flex child may actually be narrower than
            its text. */}
        <span className="line-clamp-2 min-w-0" title={entry.issueTitle}>
          {entry.issueTitle}
        </span>
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
      {/* The label itself, beside the action it caused (MAR-3138 R4): the
          action says what to do, this says why it is being asked. */}
      {entry.blocked ? (
        <span className={WAVE_ROW_ACTION_CLASS}>blocked</span>
      ) : null}
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
