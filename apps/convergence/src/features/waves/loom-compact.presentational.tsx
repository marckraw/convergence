import { Fragment, type FC } from 'react'
import { Maximize2 } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { loomSheetCounts, loomSheetTitle } from './loom-sheets.pure'
import { LoomSheetView } from './loom-sheet.presentational'
import { LoomStatusView } from './loom-status.presentational'
import { LoomTitleView } from './loom-title.presentational'
import type { LoomStackProps } from './loom-stack.types'
import { LOOM_SHEETS } from './wave-panel-sheet.pure'
import { LOOM_COMPACT_CLASS } from './wave-panel.styles'

/**
 * Loom, compact (MAR-3189 R1): the four sheet titles stacked in the column,
 * the open one's rows scrolling between them.
 *
 * The other three stay on screen as titles -- that is the whole shape. What
 * was, what is, what is queued and what is being prepared are always all four
 * visible, and exactly one of them is open.
 */
export const LoomCompactView: FC<
  LoomStackProps & { width: number; onExpand: () => void }
> = ({
  sheets,
  now,
  horses,
  qaExpanded,
  onToggleQa,
  onOpenSeat,
  onShowNext,
  onShowDetail,
  detail,
  onEscape,
  header,
  subline,
  open,
  onSelectSheet,
  inertReason,
  onOpen,
  bodyRef,
  onBodyScroll,
  titleRef,
  width,
  onExpand,
}) => {
  const counts = loomSheetCounts(sheets, now)
  return (
    <aside
      aria-label="Loom"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !onEscape) return
        event.stopPropagation()
        onEscape()
      }}
      data-loom="compact"
      className={LOOM_COMPACT_CLASS}
      style={{ width }}
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <h2 className="text-xs font-semibold tracking-tight">Loom</h2>
        <LoomStatusView header={header} />
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Expand Loom"
          className="size-6 p-0"
          onClick={onExpand}
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>
      <p className="px-3 pb-2 pt-1 text-[11px] text-muted-foreground">
        {subline}
      </p>
      <div className="flex min-h-0 flex-1 flex-col">
        {LOOM_SHEETS.map((sheet) => (
          <Fragment key={sheet}>
            <LoomTitleView
              sheet={sheet}
              title={loomSheetTitle(sheet, counts)}
              open={open === sheet}
              onSelect={() => onSelectSheet(sheet)}
              titleRef={titleRef}
            />
            {open === sheet ? (
              <LoomSheetView
                sheet={sheet}
                sheets={sheets}
                now={now}
                horses={horses}
                qaExpanded={qaExpanded}
                onToggleQa={onToggleQa}
                onOpenSeat={onOpenSeat}
                onShowNext={onShowNext}
                onShowDetail={onShowDetail}
                detail={open === sheet ? detail : null}
                inertReason={inertReason}
                onOpen={onOpen}
                bodyRef={bodyRef}
                onScroll={onBodyScroll}
                className={cn('min-h-0 flex-1')}
              />
            ) : null}
          </Fragment>
        ))}
      </div>
    </aside>
  )
}
