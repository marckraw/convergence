import type { FC, UIEvent } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { cn } from '@/shared/lib/cn.pure'
import { loomSheetNote, type LoomSheets } from './loom-sheets.pure'
import { type LoomSheet } from './wave-panel-sheet.pure'
import { WaveSectionView } from './wave-section.presentational'
import {
  LOOM_SHEET_BODY_CLASS,
  LOOM_SHEET_NOTE_CLASS,
} from './wave-panel.styles'

interface LoomSheetViewProps {
  sheet: LoomSheet
  sheets: LoomSheets
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
  inertReason,
  onOpen,
  bodyRef,
  onScroll,
  className,
}) => {
  const note = loomSheetNote(sheet, sheets)
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
        <>
          {/* The order is the order a person acts in: my eyes first, then the
              verdict I owe, then the decision somebody owes, then the work
              that needs nothing from anyone. */}
          <WaveSectionView
            title="Awaiting QA"
            rows={sheets.now.awaitingQa}
            inertReason={inertReason}
            onOpen={onOpen}
          />
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
          <WaveSectionView
            title="In flight"
            rows={sheets.now.inFlight}
            inertReason={inertReason}
            onOpen={onOpen}
          />
        </>
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
