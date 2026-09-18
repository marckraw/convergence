import { Fragment, type FC, type KeyboardEvent } from 'react'
import { Minimize2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { loomSheetCounts, loomSheetTitle } from './loom-sheets.pure'
import { LoomSheetView } from './loom-sheet.presentational'
import { LoomStatusView } from './loom-status.presentational'
import { LoomTitleView } from './loom-title.presentational'
import type { LoomStackProps } from './loom-stack.types'
import { LOOM_SHEETS } from './wave-panel-sheet.pure'
import {
  LOOM_EDGE_CLASS,
  LOOM_EDGE_LABEL_CLASS,
  LOOM_EXPANDED_CLASS,
} from './wave-panel.styles'

/**
 * Loom, expanded (MAR-3189 R5): the same four sheets across the content area,
 * the open one wide and the other three as labelled edges.
 *
 * Esc folds, because this shape stands in front of the conversation and the
 * way out has to be the one every other overlay has. The edges are the same
 * title buttons the compact stack uses, turned on their side -- one component,
 * so a sheet cannot become unreachable in one shape and not the other.
 */
export const LoomExpandedView: FC<LoomStackProps & { onFold: () => void }> = ({
  sheets,
  header,
  subline,
  open,
  onSelectSheet,
  inertReason,
  onOpen,
  bodyRef,
  onBodyScroll,
  titleRef,
  onFold,
}) => {
  const counts = loomSheetCounts(sheets)
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onFold()
  }
  return (
    <section
      aria-label="Loom"
      data-loom="expanded"
      className={LOOM_EXPANDED_CLASS}
      onKeyDown={onKeyDown}
    >
      {LOOM_SHEETS.map((sheet) => (
        <Fragment key={sheet}>
          {sheet === open ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2 px-3 py-2">
                <h2 className="text-xs font-semibold tracking-tight">Loom</h2>
                <span className="text-[11px] text-muted-foreground">
                  {subline}
                </span>
                <LoomStatusView header={header} />
                <span className="flex-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Fold Loom"
                  className="h-6 gap-1.5 px-2 text-[11px]"
                  onClick={onFold}
                >
                  <Minimize2 className="size-3.5" />
                  Fold Loom
                </Button>
              </div>
              <LoomTitleView
                sheet={sheet}
                title={loomSheetTitle(sheet, counts)}
                open
                onSelect={() => onSelectSheet(sheet)}
                titleRef={titleRef}
              />
              <LoomSheetView
                sheet={sheet}
                sheets={sheets}
                inertReason={inertReason}
                onOpen={onOpen}
                bodyRef={bodyRef}
                onScroll={onBodyScroll}
                className="min-h-0 flex-1"
              />
            </div>
          ) : (
            <LoomTitleView
              sheet={sheet}
              title={loomSheetTitle(sheet, counts)}
              open={false}
              onSelect={() => onSelectSheet(sheet)}
              className={LOOM_EDGE_CLASS}
            >
              <span className={LOOM_EDGE_LABEL_CLASS}>
                {loomSheetTitle(sheet, counts)}
              </span>
            </LoomTitleView>
          )}
        </Fragment>
      ))}
    </section>
  )
}
