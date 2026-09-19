import type { UIEvent } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { loomNowRows, loomSheetNote, type LoomSheets } from './loom-sheets.pure'
import {
  loomBefore,
  loomBeforeOlderLine,
  LOOM_DONE_IS_NOT_RELEASED,
} from './loom-before.pure'
import {
  LOOM_PLAN_IS_READ_ONLY,
  loomPlan,
  loomPlanLeftLine,
  loomUtcDay,
} from './loom-plan.pure'
import {
  loomNext,
  LOOM_NEXT_ORDER_LINE,
  LOOM_NEXT_UNSEATED_TITLE,
} from './loom-next.pure'
import {
  loomHorsesLine,
  LOOM_QA_PREVIEW,
  type LoomHorse,
} from './loom-horses.pure'
import { LoomHorseCard } from './loom-horse.presentational'
import { LoomDetailView } from './loom-detail.presentational'
import type { LoomIssueDetail } from './loom-detail.pure'
import { type LoomSheet } from './wave-panel-sheet.pure'
import { WaveSectionView } from './wave-section.presentational'
import {
  LOOM_HORSES_LINE_CLASS,
  LOOM_NOW_WIDE_CLASS,
  LOOM_QA_TOGGLE_CLASS,
  LOOM_SHEET_BODY_CLASS,
  LOOM_SHEET_NOTE_CLASS,
} from './wave-panel.styles'

/** The Awaiting QA section, so its own control can point at it (lap 2, D). */
const QA_SECTION_ID = 'loom-awaiting-qa'

interface LoomSheetViewProps<TSession = unknown> {
  sheet: LoomSheet
  sheets: LoomSheets
  /** The board's clock; Before's window is judged against it (MAR-3192). */
  now: number
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
  /** Reads an issue in place (MAR-3195); the key is all it needs. */
  onShowDetail?: (entry: WorkLedgerEntry) => void
  /** Expanded lays the horses beside the QA list; compact stacks them. */
  wide?: boolean
  inertReason: (entry: WorkLedgerEntry) => string | null
  onOpen: (entry: WorkLedgerEntry) => void
  /**
   * An issue read in place (MAR-3195): when it is given, the body IS the
   * detail and the rows wait. The sheet's own title bar stays, so a person
   * can still see which sheet they are reading inside.
   */
  detail?: {
    view: LoomIssueDetail<TSession>
    onClose: () => void
    onOpenConversation: (session: TSession) => void
    closeRef?: (element: HTMLButtonElement | null) => void
  } | null
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
export const LoomSheetView = <TSession,>({
  sheet,
  sheets,
  now,
  horses,
  qaExpanded,
  onToggleQa,
  onOpenSeat,
  onShowNext,
  onShowDetail,
  wide = false,
  detail,
  inertReason,
  onOpen,
  bodyRef,
  onScroll,
  className,
}: LoomSheetViewProps<TSession>) => {
  const note = loomSheetNote(sheet, sheets, now)
  // One derivation for the groups, the older line and (through
  // `loomSheetCounts`) the title above them (MAR-3192 R4).
  const before = loomBefore(sheets.before, now)
  const olderLine = loomBeforeOlderLine(before.older)
  // The same one derivation for Plan's stages, its left line and its title
  // (MAR-3194 R5); `today` comes from the board's own clock, so the day a
  // grounding is aged against is the day the rest of the panel is drawn on.
  const plan = loomPlan(sheets.plan, loomUtcDay(now))
  // The same one derivation for the queues and (through `loomSheetCounts`)
  // the title above them (MAR-3193 R5).
  const next = loomNext(sheets.next, horses)
  const leftLine = loomPlanLeftLine(plan.left)
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
      {detail ? (
        <LoomDetailView
          detail={detail.view}
          onClose={detail.onClose}
          onOpenConversation={detail.onOpenConversation}
          closeRef={detail.closeRef}
        />
      ) : (
        <>
          {note ? <p className={LOOM_SHEET_NOTE_CLASS}>{note}</p> : null}
          {sheet === 'before' ? (
            <>
              {/* Grouped by the wave the work belonged to (MAR-3192 R1),
                  newest first and only the newest open: what a person wants
                  from "what was before" is the last thing that finished. */}
              {before.groups.map((group, at) => (
                <WaveSectionView
                  appearance="loom"
                  key={group.key}
                  title={group.title}
                  rows={group.rows}
                  disclosure={at === 0 ? 'open' : 'closed'}
                  inertReason={inertReason}
                  onOpen={onOpen}
                />
              ))}
              {olderLine && before.shown > 0 ? (
                <p className={LOOM_SHEET_NOTE_CLASS}>{olderLine}</p>
              ) : null}
              {before.shown > 0 ? (
                <p className={LOOM_SHEET_NOTE_CLASS}>
                  {LOOM_DONE_IS_NOT_RELEASED}
                </p>
              ) : null}
            </>
          ) : null}
          {sheet === 'now' ? (
            <div className={wide ? LOOM_NOW_WIDE_CLASS : undefined}>
              {/* The horses first (MAR-3191): "what is on now" is a question
              about seats, and the four sections below only ever answered it
              about issues -- an idle or unreachable horse held none, so it
              was invisible on the sheet that exists to show it. */}
              <section
                aria-label="Horses"
                className="flex min-w-0 flex-col gap-2"
              >
                <h3 className={LOOM_HORSES_LINE_CLASS}>
                  {loomHorsesLine(horses)}
                </h3>
                {horses.map((horse) => (
                  <LoomHorseCard
                    key={horse.key}
                    horse={horse}
                    onOpenSeat={onOpenSeat}
                    onShowNext={onShowNext}
                    onShowDetail={
                      horse.held && onShowDetail
                        ? () => onShowDetail(horse.held!.entry)
                        : undefined
                    }
                  />
                ))}
              </section>
              {/* The order is the order a person acts in: my eyes first, then the
              verdict I owe, then the decision somebody owes, then the work
              that needs nothing from anyone. */}
              <div className="flex flex-col">
                {/* The control lives INSIDE the section it reveals (lap 2, D),
                so `aria-controls` points at an ancestor a screen reader is
                already inside and the relationship is readable. */}
                <WaveSectionView
                  appearance="loom"
                  title="Awaiting QA"
                  count={qa.length}
                  rows={qaShown}
                  inertReason={inertReason}
                  onOpen={onOpen}
                  footer={
                    qa.length > LOOM_QA_PREVIEW ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-expanded={qaExpanded}
                        aria-controls={QA_SECTION_ID}
                        className={LOOM_QA_TOGGLE_CLASS}
                        onClick={onToggleQa}
                      >
                        {qaExpanded
                          ? 'Show fewer'
                          : `Show all ${qa.length} awaiting QA`}
                      </Button>
                    ) : null
                  }
                  id={QA_SECTION_ID}
                />
                <WaveSectionView
                  appearance="loom"
                  title="Fable’s turn"
                  rows={sheets.now.fablesTurn}
                  inertReason={inertReason}
                  onOpen={onOpen}
                />
                <WaveSectionView
                  appearance="loom"
                  title="Decide"
                  rows={sheets.now.decide}
                  inertReason={inertReason}
                  onOpen={onOpen}
                />
                {/* The rows no card holds (R4): one function, both shapes. */}
                <WaveSectionView
                  appearance="loom"
                  title="In flight"
                  rows={loomNowRows(sheets, horses)}
                  inertReason={inertReason}
                  onOpen={onOpen}
                />
              </div>
            </div>
          ) : null}
          {sheet === 'next' ? (
            <>
              {/* One group per horse that has anything waiting (MAR-3193
                  R1), each saying what that horse is doing now. */}
              <div
                className={
                  wide
                    ? 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4'
                    : undefined
                }
              >
                {next.seats.map((seat) => (
                  <WaveSectionView
                    appearance="loom"
                    key={seat.key}
                    title={seat.title}
                    hint={seat.capacity}
                    count={seat.ready.length + seat.preparing.length}
                    rows={[...seat.ready, ...seat.preparing]}
                    inertReason={inertReason}
                    onOpen={onOpen}
                  />
                ))}
                <WaveSectionView
                  appearance="loom"
                  title={LOOM_NEXT_UNSEATED_TITLE}
                  rows={next.unseated}
                  inertReason={inertReason}
                  onOpen={onOpen}
                />
              </div>
              {next.seats.length > 0 || next.unseated.length > 0 ? (
                <p className={LOOM_SHEET_NOTE_CLASS}>{LOOM_NEXT_ORDER_LINE}</p>
              ) : null}
            </>
          ) : null}
          {sheet === 'plan' ? (
            <>
              {/* The stages of preparation, in the order it happens
                  (MAR-3194 R3). Read-only by ruling: the only thing a
                  person can press here is a row, and it opens the detail. */}
              <div
                className={
                  wide
                    ? 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4'
                    : undefined
                }
              >
                {plan.stages.map((stage) => (
                  <WaveSectionView
                    appearance="loom"
                    key={stage.key}
                    title={stage.title}
                    hint={stage.hint}
                    rows={stage.rows}
                    inertReason={inertReason}
                    onOpen={onOpen}
                  />
                ))}
              </div>
              {leftLine && plan.preparing > 0 ? (
                <p className={LOOM_SHEET_NOTE_CLASS}>{leftLine}</p>
              ) : null}
              {plan.preparing > 0 ? (
                <p className={LOOM_SHEET_NOTE_CLASS}>
                  {LOOM_PLAN_IS_READ_ONLY}
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
