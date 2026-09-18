import type { FC, UIEvent } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { loomNowRows, loomSheetNote, type LoomSheets } from './loom-sheets.pure'
import {
  loomHorsesLine,
  LOOM_QA_PREVIEW,
  type LoomHorse,
} from './loom-horses.pure'
import { LoomHorseCard } from './loom-horse.presentational'
import { type LoomSheet } from './wave-panel-sheet.pure'
import { WaveSectionView } from './wave-section.presentational'
import {
  LOOM_HORSES_LINE_CLASS,
  LOOM_NOW_WIDE_CLASS,
  LOOM_QA_TOGGLE_CLASS,
  LOOM_SHEET_BODY_CLASS,
  LOOM_SHEET_NOTE_CLASS,
} from './wave-panel.styles'

interface LoomSheetViewProps {
  sheet: LoomSheet
  sheets: LoomSheets
  /** The bound crews' horse seats, in crew order (MAR-3191 R1). */
  horses: readonly LoomHorse[]
  /**
   * Whether Awaiting QA is showing all of its rows (R5). A prop, not state:
   * this file is a presentational, and the choice has to survive the sheet
   * being torn down and rebuilt when a person switches away and back.
   */
  qaExpanded: boolean
  onToggleQa: () => void
  onOpenSeat?: (sessionId: string) => void
  onShowNext?: () => void
  /** Expanded lays the horses beside the QA list; compact stacks them. */
  wide?: boolean
  inertReason: (entry: WorkLedgerEntry) => string | null
  onOpen: (entry: WorkLedgerEntry) => void
  /** The scroll container itself, so the container can restore its offset (R3). */
  bodyRef?: (element: HTMLDivElement | null) => void
  onScroll?: (event: UIEvent<HTMLDivElement>) => void
  className?: string
}

/**
 * One sheet's contents (MAR-3189 R1): the same body compact and expanded, so
 * the two shapes cannot drift into showing different things.
 *
 * Only the OPEN sheet is ever rendered -- the other three are titles and
 * nothing more. That is the rule R1 is about: a person reads one sheet at a
 * time, and a screen reader walking the panel meets one list, not four.
 */
export const LoomSheetView: FC<LoomSheetViewProps> = ({
  sheet,
  sheets,
  horses,
  qaExpanded,
  onToggleQa,
  onOpenSeat,
  onShowNext,
  wide = false,
  inertReason,
  onOpen,
  bodyRef,
  onScroll,
  className,
}) => {
  const note = loomSheetNote(sheet, sheets)
  const qa = sheets.now.awaitingQa
  const qaShown = qaExpanded ? qa : qa.slice(0, LOOM_QA_PREVIEW)
  return (
    <div
      ref={bodyRef}
      onScroll={onScroll}
      id={`loom-sheet-${sheet}`}
      data-loom-sheet={sheet}
      className={cn(LOOM_SHEET_BODY_CLASS, className)}
    >
      {note ? <p className={LOOM_SHEET_NOTE_CLASS}>{note}</p> : null}
      {sheet === 'before' ? (
        <WaveSectionView
          title="Done"
          rows={sheets.before}
          inertReason={inertReason}
          onOpen={onOpen}
        />
      ) : null}
      {sheet === 'now' ? (
        <div className={wide ? LOOM_NOW_WIDE_CLASS : undefined}>
          {/* The horses first (MAR-3191): "what is on now" is a question
              about seats, and the four sections below only ever answered it
              about issues -- an idle or unreachable horse held none, so it
              was invisible on the sheet that exists to show it. */}
          <section aria-label="Horses" className="flex flex-col">
            <h3 className={LOOM_HORSES_LINE_CLASS}>{loomHorsesLine(horses)}</h3>
            {horses.map((horse) => (
              <LoomHorseCard
                key={horse.key}
                horse={horse}
                onOpenSeat={onOpenSeat}
                onShowNext={onShowNext}
              />
            ))}
          </section>
          {/* The order is the order a person acts in: my eyes first, then the
              verdict I owe, then the decision somebody owes, then the work
              that needs nothing from anyone. */}
          <div className="flex flex-col">
            <WaveSectionView
              title="Awaiting QA"
              count={qa.length}
              rows={qaShown}
              inertReason={inertReason}
              onOpen={onOpen}
            />
            {qa.length > LOOM_QA_PREVIEW ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={LOOM_QA_TOGGLE_CLASS}
                onClick={onToggleQa}
              >
                {qaExpanded
                  ? 'Show fewer'
                  : `Show all ${qa.length} awaiting QA`}
              </Button>
            ) : null}
            <WaveSectionView
              title="Fable’s turn"
              rows={sheets.now.fablesTurn}
              inertReason={inertReason}
              onOpen={onOpen}
            />
            <WaveSectionView
              title="Decide"
              rows={sheets.now.decide}
              inertReason={inertReason}
              onOpen={onOpen}
            />
            {/* The rows no card holds (R4): one function, both shapes. */}
            <WaveSectionView
              title="In flight"
              rows={loomNowRows(sheets, horses)}
              inertReason={inertReason}
              onOpen={onOpen}
            />
          </div>
        </div>
      ) : null}
      {sheet === 'next' ? (
        <WaveSectionView
          title="Queued"
          rows={sheets.next}
          inertReason={inertReason}
          onOpen={onOpen}
        />
      ) : null}
      {sheet === 'plan' ? (
        <WaveSectionView
          title="In preparation"
          rows={sheets.plan}
          inertReason={inertReason}
          onOpen={onOpen}
        />
      ) : null}
    </div>
  )
}
