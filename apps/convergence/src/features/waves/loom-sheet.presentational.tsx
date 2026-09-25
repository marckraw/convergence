import type { DispatchPlan } from '@/shared/types/tracker.types'
import type { ReactNode, UIEvent } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import {
  loomNowRows,
  loomSheetCounts,
  loomSheetNote,
  type LoomSheets,
} from './loom-sheets.pure'
import {
  loomBefore,
  loomBeforeOlder,
  loomBeforeOlderLine,
  LOOM_DONE_IS_NOT_RELEASED,
} from './loom-before.pure'
import {
  LOOM_PLAN_IS_READ_ONLY,
  loomPlan,
  loomPlanLeft,
  loomPlanLeftLine,
  loomUtcDay,
} from './loom-plan.pure'
import {
  loomSearchElsewhereLabel,
  loomSearchElsewherePrefix,
  loomSearchHorsesLine,
  LOOM_SEARCH_LEFT_TITLE,
  LOOM_SEARCH_OLDER_TITLE,
} from './loom-search.pure'
import type { LoomSheetSearch } from './loom-stack.types'
import {
  LOOM_DISPATCH_ORDER_LINE,
  LOOM_NEXT_ORDER_LINE,
  LOOM_NEXT_UNSEATED_TITLE,
} from './loom-next.pure'
import {
  loomHorsesLine,
  LOOM_QA_PREVIEW,
  type LoomHorse,
  type LoomMastermind,
} from './loom-horses.pure'
import { LoomHorseCardContainer as LoomHorseCard } from './loom-horse.container'
import { LoomMastermindCardContainer } from './loom-mastermind.container'
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
  LOOM_SEARCH_ELSEWHERE_CLASS,
  LOOM_SEARCH_MISS_CLASS,
} from './wave-panel.styles'

/** The Awaiting QA section, so its own control can point at it (lap 2, D). */
const QA_SECTION_ID = 'loom-awaiting-qa'

interface LoomSheetViewProps<TSession = unknown> {
  mergeReviewed?: ReactNode
  dispatchPlan?: DispatchPlan | null
  sheet: LoomSheet
  sheets: LoomSheets
  /** The board's clock; Before's window is judged against it (MAR-3192). */
  now: number
  /** The bound crews' horse seats, in crew order (MAR-3191 R1). */
  horses: readonly LoomHorse[]
  masterminds?: readonly LoomMastermind[]
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
  /**
   * "Not in the loop" (MAR-3236), built by the container for the crew on
   * screen and drawn LAST in Plan -- after the stages and the left line. A
   * node, the way the header takes Refresh: this file stays render-only.
   */
  outside?: ReactNode
  /**
   * The active search (MAR-3234), or absent when nothing is searched -- and
   * then the sheet is exactly the sheet it was before search existed.
   */
  search?: LoomSheetSearch | null
  /** Opens another sheet: the "1 in Plan" answers are doors to it (R3). */
  onSelectSheet?: (sheet: LoomSheet) => void
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
  masterminds = [],
  dispatchPlan = null,
  mergeReviewed,
  qaExpanded,
  onToggleQa,
  onOpenSeat,
  onShowNext,
  onShowDetail,
  wide = false,
  detail,
  inertReason,
  onOpen,
  outside,
  search = null,
  onSelectSheet,
  bodyRef,
  onScroll,
  className,
}: LoomSheetViewProps<TSession>) => {
  // While a search is active the sheet's own notes step aside: "Nothing in
  // Now right now" about a filtered sheet is a sentence about the filter
  // wearing the words of the ledger (MAR-3234 R3/R5). A visible mastermind
  // also means Now has something to show, even without issue rows.
  const note =
    search || (sheet === 'now' && masterminds.length > 0)
      ? null
      : loomSheetNote(sheet, sheets, now)
  // With a search, the open sheet may hold no matching issues. The miss
  // line says where the matches are (R3), or why there are none (R5); the
  // mastermind stays above it because it is independent of issue search.
  const missed =
    search !== null && search.summary.bySheet[sheet] === 0 ? search : null
  // The counted-not-listed buckets are LISTED while a query is active (R5):
  // "is this ticket anywhere" deserves the row, not a count. With no query
  // these are never computed, so the sheet is byte-identical to before.
  const olderRows = search ? loomBeforeOlder(sheets.before, now) : []
  const leftRows = search ? loomPlanLeft(sheets.plan) : []
  // The cards a search shows (R4): a horse iff the issue it holds matches.
  const cards = search ? search.shownHorses : horses
  const horsesLine = search
    ? loomSearchHorsesLine(search.shownHorses, horses)
    : loomHorsesLine(horses)
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
  const next = loomSheetCounts(sheets, now, horses, dispatchPlan).nextQueue
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
      {!detail && sheet === 'now' && masterminds.length > 0 ? (
        <section
          aria-label="Mastermind"
          className="mb-4 flex min-w-0 flex-col gap-2"
        >
          <h3 className={LOOM_HORSES_LINE_CLASS}>Mastermind</h3>
          {masterminds.map((mastermind) => (
            <LoomMastermindCardContainer
              key={mastermind.key}
              mastermind={mastermind}
              showCrewName={
                new Set([...horses, ...masterminds].map((seat) => seat.crewId))
                  .size > 1
              }
              onOpenSeat={onOpenSeat}
            />
          ))}
        </section>
      ) : null}
      {detail ? (
        <LoomDetailView
          detail={detail.view}
          onClose={detail.onClose}
          onOpenConversation={detail.onOpenConversation}
          closeRef={detail.closeRef}
        />
      ) : missed ? (
        <p data-loom-search-miss="" className={LOOM_SEARCH_MISS_CLASS}>
          {missed.summary.elsewhere.length > 0 ? (
            <>
              {loomSearchElsewherePrefix(sheet)}
              {missed.summary.elsewhere.map((place, at) => (
                <span key={place.sheet}>
                  {at > 0 ? ', ' : null}
                  <Button
                    type="button"
                    variant="link"
                    className={LOOM_SEARCH_ELSEWHERE_CLASS}
                    onClick={() => onSelectSheet?.(place.sheet)}
                  >
                    {loomSearchElsewhereLabel(place)}
                  </Button>
                </span>
              ))}
            </>
          ) : (
            missed.nowhere
          )}
        </p>
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
                  layout={wide ? 'grid' : 'list'}
                  key={group.key}
                  title={group.title}
                  rows={group.rows}
                  // Every group open while searched (MAR-3234 R3): a match
                  // folded inside a closed wave is not "one click away".
                  disclosure={search || at === 0 ? 'open' : 'closed'}
                  inertReason={inertReason}
                  onOpen={onOpen}
                />
              ))}
              {olderRows.length > 0 ? (
                <WaveSectionView
                  appearance="loom"
                  layout={wide ? 'grid' : 'list'}
                  title={LOOM_SEARCH_OLDER_TITLE}
                  rows={olderRows}
                  inertReason={inertReason}
                  onOpen={onOpen}
                />
              ) : null}
              {!search && olderLine && before.shown > 0 ? (
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
              {/* The horses (MAR-3191): "what is on now" is a question
              about seats, and the four sections below only ever answered it
              about issues -- an idle or unreachable horse held none, so it
              was invisible on the sheet that exists to show it. */}
              <section
                aria-label="Horses"
                className="flex min-w-0 flex-col gap-2"
              >
                <h3 className={LOOM_HORSES_LINE_CLASS}>{horsesLine}</h3>
                {cards.map((horse) => (
                  <LoomHorseCard
                    key={horse.key}
                    horse={horse}
                    onOpenSeat={onOpenSeat}
                    onShowNext={onShowNext}
                    onShowDetail={(() => {
                      // The card's issue: held, else sent (MAR-3204 R4).
                      const row = horse.held ?? horse.dispatched
                      return row && onShowDetail
                        ? () => onShowDetail(row.entry)
                        : undefined
                    })()}
                  />
                ))}
              </section>
              {/* The order is the order a person acts in: my eyes first, then the
              verdict I owe, then the decision somebody owes, then the work
              that needs nothing from anyone. */}
              {(() => {
                const groups = (
                  <>
                    {/* The control lives INSIDE the section it reveals (lap 2, D),
                so `aria-controls` points at an ancestor a screen reader is
                already inside and the relationship is readable. */}
                    <WaveSectionView
                      appearance="loom"
                      title="Awaiting QA"
                      action={mergeReviewed}
                      hint={wide ? 'QA and say done, by name' : undefined}
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
                      hint={wide ? 'A verdict is owed' : undefined}
                      rows={sheets.now.fablesTurn}
                      inertReason={inertReason}
                      onOpen={onOpen}
                    />
                    <WaveSectionView
                      appearance="loom"
                      title="Decide"
                      hint={wide ? 'A decision is yours' : undefined}
                      rows={sheets.now.decide}
                      inertReason={inertReason}
                      onOpen={onOpen}
                    />
                    {/* The rows no card holds (R4): one function, both shapes. */}
                    <WaveSectionView
                      appearance="loom"
                      title="In flight"
                      hint={wide ? 'Nothing is owed to anyone' : undefined}
                      rows={loomNowRows(sheets, horses)}
                      inertReason={inertReason}
                      onOpen={onOpen}
                    />
                  </>
                )
                return wide ? (
                  groups
                ) : (
                  <div className="flex flex-col">{groups}</div>
                )
              })()}
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
              {dispatchPlan ||
              next.seats.length > 0 ||
              next.unseated.length > 0 ? (
                <p className={LOOM_SHEET_NOTE_CLASS}>
                  {dispatchPlan
                    ? LOOM_DISPATCH_ORDER_LINE
                    : LOOM_NEXT_ORDER_LINE}
                </p>
              ) : null}
              {dispatchPlan ? (
                <p className={LOOM_SHEET_NOTE_CLASS}>
                  Planned{' '}
                  {new Date(dispatchPlan.plannedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}{' '}
                  ·{' '}
                  {dispatchPlan.autoDispatch
                    ? 'Auto-dispatch is on · sends within a minute'
                    : 'Auto-dispatch is off · nothing is sent'}
                </p>
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
              {leftRows.length > 0 ? (
                <WaveSectionView
                  appearance="loom"
                  title={LOOM_SEARCH_LEFT_TITLE}
                  rows={leftRows}
                  inertReason={inertReason}
                  onOpen={onOpen}
                />
              ) : null}
              {!search && leftLine && plan.preparing > 0 ? (
                <p className={LOOM_SHEET_NOTE_CLASS}>{leftLine}</p>
              ) : null}
              {plan.preparing > 0 ? (
                <p className={LOOM_SHEET_NOTE_CLASS}>
                  {LOOM_PLAN_IS_READ_ONLY}
                </p>
              ) : null}
              {/* Last, and outside the count in Plan's title: none of it is
                  preparation until somebody labels it (MAR-3236 R6). */}
              {outside}
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
