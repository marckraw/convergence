import type { FC } from 'react'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { loomSheetCounts, type LoomSheets } from './loom-sheets.pure'
import {
  LOOM_SHEETS,
  LOOM_SHEET_NAMES,
  type LoomSheet,
} from './wave-panel-sheet.pure'
import { WAVE_OUTAGE_DOT_CLASS, WAVE_RAIL_CLASS } from './wave-panel.styles'

interface LoomStripViewProps {
  sheets: LoomSheets
  outage: boolean
  onExpand: () => void
}

/** How many rows each sheet holds, for the strip's four numbers. */
function stripCount(sheets: LoomSheets, sheet: LoomSheet): number {
  const counts = loomSheetCounts(sheets)
  if (sheet === 'before') return counts.before
  if (sheet === 'now') return counts.open + counts.awaitingQa
  if (sheet === 'next') return counts.next
  return counts.plan
}

/**
 * Loom in a window too narrow to hold the column (MAR-3189 R4): the four
 * counts and the outage dot, read off the same sheets the stack draws.
 *
 * Expand is LIVE here, unlike the rail it replaces (MAR-3148 R1). That
 * control used to open a column beside the conversation, which a window this
 * narrow could not hold, so it said so and did nothing. Expand puts Loom in
 * the content area instead -- there is no width left to refuse, so refusing
 * would be the strip claiming a limit the mechanism no longer has.
 */
export const LoomStripView: FC<LoomStripViewProps> = ({
  sheets,
  outage,
  onExpand,
}) => (
  <aside aria-label="Loom strip" data-loom="strip" className={WAVE_RAIL_CLASS}>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Expand Loom"
      className="size-7 p-0"
      onClick={onExpand}
    >
      <Maximize2 className="size-3.5" />
    </Button>
    {outage ? (
      <span
        role="status"
        aria-label="Tracker not answering"
        className={WAVE_OUTAGE_DOT_CLASS}
      />
    ) : null}
    {LOOM_SHEETS.map((sheet) => (
      <span
        key={sheet}
        data-wave-count={sheet}
        title={LOOM_SHEET_NAMES[sheet]}
        aria-label={`${LOOM_SHEET_NAMES[sheet]}: ${stripCount(sheets, sheet)}`}
        className="text-xs tabular-nums text-muted-foreground"
      >
        {stripCount(sheets, sheet)}
      </span>
    ))}
  </aside>
)
