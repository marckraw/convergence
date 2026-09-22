import type { DispatchPlan } from '@/shared/types/tracker.types'
import type { FC } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CircleDot,
  History,
  ListOrdered,
  Maximize2,
  NotebookPen,
  PanelLeftOpen,
} from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { loomSheetCounts, type LoomSheets } from './loom-sheets.pure'
import type { LoomHorse } from './loom-horses.pure'
import {
  LOOM_SHEETS,
  LOOM_SHEET_NAMES,
  type LoomSheet,
} from './wave-panel-sheet.pure'
import {
  LOOM_NO_DRAG_STYLE,
  LOOM_STRIP_BUTTON_CLASS,
  LOOM_STRIP_COUNT_CLASS,
  LOOM_STRIP_SHEET_CLASS,
  WAVE_OUTAGE_DOT_CLASS,
  WAVE_RAIL_CLASS,
} from './wave-panel.styles'

interface LoomStripViewProps {
  dispatchPlan?: DispatchPlan | null
  sheets: LoomSheets
  /** The board's clock; Before's count is a window over it (MAR-3192). */
  now: number
  /**
   * The same horse seats the stacks get (MAR-3193 R5).
   *
   * The strip draws only the totals, but it reads them from the ONE counts
   * function, and Next's split is a fact about seats -- handing it an empty
   * roster here would be a second derivation quietly disagreeing with the
   * column's.
   */
  horses: readonly LoomHorse[]
  outage: boolean
  /** Back to Loom without choosing a sheet: the top control (MAR-3292 R2). */
  onOpen: () => void
  onExpand: () => void
  /** A sheet's icon: open Loom ON that sheet, one act (MAR-3292 R3). */
  onSelectSheet: (sheet: LoomSheet) => void
}

/** How many rows each sheet holds, for the strip's four numbers. */
function stripCount(
  sheets: LoomSheets,
  sheet: LoomSheet,
  now: number,
  horses: readonly LoomHorse[],
  dispatchPlan: DispatchPlan | null,
): number {
  const counts = loomSheetCounts(sheets, now, horses, dispatchPlan)
  if (sheet === 'before') return counts.before
  if (sheet === 'now') return counts.open + counts.awaitingQa
  if (sheet === 'next') return counts.next
  return counts.plan
}

/**
 * One glyph per sheet, in the sheets' own reading order (MAR-3292 R2): what
 * was, what is, what is queued, what is still being shaped.
 */
const LOOM_STRIP_ICONS: Readonly<Record<LoomSheet, LucideIcon>> = {
  before: History,
  now: CircleDot,
  next: ListOrdered,
  plan: NotebookPen,
}

/**
 * Loom folded (MAR-3292): the four counts under their icons and the outage
 * dot, read off the same sheets the stack draws.
 *
 * One component for both reasons the strip is on screen -- a window too
 * narrow for the column (MAR-3189 R4) and a person who asked for no column
 * (MAR-3292 R1). It does not know which; its caller does, and decides where
 * each way out leads.
 *
 * Every control here opens something. That is the whole condition on which
 * MAR-3189's removal of the collapsed rail as a preference was reversed: the
 * old rail was a panel with no sheet in it, and this column is a door per
 * sheet.
 *
 * `no-drag` on the aside, with no `drag` child (MAR-3284's law): Electron
 * builds its draggable region from the DOM in tree order and knows nothing
 * about stacking, so silence here is not "no opinion" -- it is "whatever is
 * underneath decides", and a covered title strip would eat every icon on this
 * column.
 */
export const LoomStripView: FC<LoomStripViewProps> = ({
  sheets,
  now,
  horses,
  dispatchPlan = null,
  outage,
  onOpen,
  onExpand,
  onSelectSheet,
}) => (
  <aside
    aria-label="Loom strip"
    data-loom="strip"
    className={WAVE_RAIL_CLASS}
    style={LOOM_NO_DRAG_STYLE}
  >
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Open Loom"
      className={LOOM_STRIP_BUTTON_CLASS}
      style={LOOM_NO_DRAG_STYLE}
      onClick={onOpen}
    >
      <PanelLeftOpen className="size-3.5" />
    </Button>
    {outage ? (
      <span
        role="status"
        aria-label="Tracker not answering"
        className={WAVE_OUTAGE_DOT_CLASS}
      />
    ) : null}
    {LOOM_SHEETS.map((sheet) => {
      const Icon = LOOM_STRIP_ICONS[sheet]
      // Read once and shown twice -- the glyph's name and the number under
      // it are one fact, so they are one call to the one counts function.
      const count = stripCount(sheets, sheet, now, horses, dispatchPlan)
      const name = `${LOOM_SHEET_NAMES[sheet]}: ${count}`
      return (
        <Button
          key={sheet}
          type="button"
          variant="ghost"
          size="sm"
          data-loom-strip-sheet={sheet}
          title={name}
          aria-label={name}
          className={LOOM_STRIP_SHEET_CLASS}
          style={LOOM_NO_DRAG_STYLE}
          onClick={() => onSelectSheet(sheet)}
        >
          <Icon className="size-3.5" />
          <span data-wave-count={sheet} className={LOOM_STRIP_COUNT_CLASS}>
            {count}
          </span>
        </Button>
      )
    })}
    {/* Expand is LIVE here, unlike the rail this strip replaces (MAR-3148
        R1). That control used to open a column beside the conversation,
        which a window this narrow could not hold, so it said so and did
        nothing. Expand puts Loom in the content area instead -- there is no
        width left to refuse, so refusing would be the strip claiming a limit
        the mechanism no longer has. */}
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Expand Loom"
      className={`mt-auto ${LOOM_STRIP_BUTTON_CLASS}`}
      style={LOOM_NO_DRAG_STYLE}
      onClick={onExpand}
    >
      <Maximize2 className="size-3.5" />
    </Button>
  </aside>
)
