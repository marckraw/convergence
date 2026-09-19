import {
  LOOM_SHEETS,
  LOOM_SHEET_NAMES,
  type LoomSheet,
} from './wave-panel-sheet.pure'
import { loomSheetTitle, type LoomSheetCounts } from './loom-sheets.pure'
import {
  LEARN_LOOM_REFERENCE_TITLE,
  LEARN_LOOM_STEP_COPY,
  type LearnLoomStepCopy,
} from './learn-loom-copy.pure'

/** Which of the guide's two views is on screen. */
export type LearnLoomView = 'steps' | 'reference'

/** How a step colours its ticket; every emphasis also changes words (R7). */
export type LearnLoomEmphasis = 'blue' | 'amber' | 'green'

/** One beat of the lesson — the handoff's motion-and-state table, as data. */
export interface LearnLoomStep {
  key: string
  /** Zero-based; the copy says `N / 6`. */
  index: number
  activeSheet: LoomSheet
  counts: LoomSheetCounts
  ticketStatus: string
  emphasis: LearnLoomEmphasis
}

/**
 * The illustration's counts: every number the row does not name is zero.
 *
 * A real `LoomSheetCounts` rather than a loose object, so the demo is fed to
 * `loomSheetTitle` exactly as the app's own sheets are (R2) -- there is no
 * second shape here that could drift from the real one.
 */
function demoCounts(named: Partial<LoomSheetCounts>): LoomSheetCounts {
  return {
    before: 0,
    open: 0,
    awaitingQa: 0,
    next: 0,
    nextReady: 0,
    nextPreparing: 0,
    plan: 0,
    ...named,
  }
}

/**
 * The six steps, in the handoff's order (MAR-3201 R1).
 *
 * The lesson is chronological but the movement is right-to-left, because the
 * sheets are in Loom's own order. Steps 3-5 all sit on `now`: the ticket does
 * NOT leave Now while the mastermind reviews or the person accepts -- that is
 * the distinction the whole lesson exists to teach, and moving the card there
 * would teach the opposite.
 */
export const LEARN_LOOM_STEPS: readonly LearnLoomStep[] = [
  {
    key: 'prepare',
    index: 0,
    activeSheet: 'plan',
    counts: demoCounts({ plan: 1 }),
    ticketStatus: 'Brief → code check',
    emphasis: 'blue',
  },
  {
    key: 'assign',
    index: 1,
    activeSheet: 'next',
    counts: demoCounts({ next: 1, nextReady: 1 }),
    ticketStatus: '1 · ready',
    emphasis: 'blue',
  },
  {
    key: 'work',
    index: 2,
    activeSheet: 'now',
    counts: demoCounts({ open: 1 }),
    ticketStatus: 'Linear: In Progress',
    emphasis: 'blue',
  },
  {
    key: 'review',
    index: 3,
    activeSheet: 'now',
    counts: demoCounts({ open: 1 }),
    ticketStatus: 'Fable’s turn · Linear: In Review',
    emphasis: 'blue',
  },
  {
    key: 'accept',
    index: 4,
    activeSheet: 'now',
    counts: demoCounts({ awaitingQa: 1 }),
    ticketStatus: 'Awaiting QA · Linear: Reviewed',
    emphasis: 'amber',
  },
  {
    key: 'history',
    index: 5,
    activeSheet: 'before',
    counts: demoCounts({ before: 1 }),
    ticketStatus: 'Linear: Done',
    emphasis: 'green',
  },
]

export const LEARN_LOOM_STEP_COUNT = LEARN_LOOM_STEPS.length

/**
 * The illustration's measurements, once (MAR-3201 lap 3, F).
 *
 * Every other number the drawing needs -- the stride between closed sheets,
 * the ticket's left edge, the width it may not exceed -- is derived from
 * these four. LL2 animates those positions and LL3 reflows them, so a
 * second copy of any of them is a future disagreement with a deadline.
 */
export const LEARN_LOOM_GEOMETRY = {
  /** A sheet nobody is looking at. */
  closedWidth: 136,
  /** How far each sheet sits over its neighbour. */
  overlap: 24,
  /** The ticket's inset from the active sheet's left edge. */
  ticketInset: 18,
  /** What the ticket wants to be, when the sheet has room for it. */
  ticketWidth: 360,
} as const

/** How much width each closed sheet actually costs, after the overlap. */
export function learnLoomSheetStride(): number {
  return LEARN_LOOM_GEOMETRY.closedWidth - LEARN_LOOM_GEOMETRY.overlap
}

/**
 * The ticket's left edge for an active sheet at `index`.
 *
 * Every sheet before the active one is closed, so the active sheet's own
 * left edge is `index` strides in, and the ticket sits one inset inside it.
 */
export function learnLoomTicketLeft(activeIndex: number): number {
  return activeIndex * learnLoomSheetStride() + LEARN_LOOM_GEOMETRY.ticketInset
}

/**
 * The widest the ticket may be, as a CSS length over the illustration.
 *
 * The active sheet is whatever the three closed ones leave, and the ticket
 * keeps its inset on both sides of that -- so the clamp is written once,
 * from the same four numbers, rather than as a magic `372`.
 */
export function learnLoomTicketMaxWidth(sheetCount: number): string {
  const closed = (sheetCount - 1) * learnLoomSheetStride()
  const insets = 2 * LEARN_LOOM_GEOMETRY.ticketInset
  return `calc(100% - ${closed + insets}px)`
}

/** The step a person lands on: opening always starts the lesson (R5). */
export const LEARN_LOOM_FIRST_STEP = 0

/**
 * Where a press lands, clamped to the lesson (R5).
 *
 * Clamped rather than wrapped, and computed from the index alone, so a burst
 * of ten presses settles on the arithmetic result instead of a queue of
 * half-applied moves.
 */
export function learnLoomStepAt(index: number): number {
  if (!Number.isFinite(index)) return LEARN_LOOM_FIRST_STEP
  return Math.max(0, Math.min(LEARN_LOOM_STEP_COUNT - 1, Math.trunc(index)))
}

/** One sheet of the illustration, as it is drawn. */
export interface LearnLoomSheetView {
  sheet: LoomSheet
  name: string
  /** `Plan · 1 in preparation` — the app's own sentence (R2). */
  title: string
  active: boolean
}

/** The whole guide at one step: what to draw and what to say. */
export interface LearnLoomStepView {
  step: LearnLoomStep
  copy: LearnLoomStepCopy
  sheets: readonly LearnLoomSheetView[]
  /** What the live region says when the step changes (R7). */
  announcement: string
  /** Back is dead on the first step; the lesson has no earlier beat. */
  backDisabled: boolean
  /** The last step's primary control closes instead of advancing (R5). */
  isLast: boolean
}

/**
 * The illustration's four titles, spoken in the app's own count language.
 *
 * `loomSheetTitle` is the app's function, called with the step's counts --
 * not a second set of strings that would keep saying `Next · 1 queued` a
 * month after the real sheet started saying something else (R2).
 */
export function learnLoomSheetViews(
  step: LearnLoomStep,
): readonly LearnLoomSheetView[] {
  return LOOM_SHEETS.map((sheet) => ({
    sheet,
    name: LOOM_SHEET_NAMES[sheet],
    title: loomSheetTitle(sheet, step.counts),
    active: sheet === step.activeSheet,
  }))
}

/** `Step 3 of 6: Watch the work, not just the spinner.` (R7). */
export function learnLoomAnnouncement(index: number): string {
  const at = learnLoomStepAt(index)
  return `Step ${at + 1} of ${LEARN_LOOM_STEP_COUNT}: ${LEARN_LOOM_STEP_COPY[at]!.title}`
}

/**
 * Everything the guide says out loud (lap 3, D).
 *
 * One sentence for whichever view is open, so a person who cannot see the
 * dialog is told the same three facts a sighted person reads: where they
 * are, what the ticket's status is now, and which sheet that puts it in.
 * The status words live here as well as on the card, because the card sits
 * inside an `aria-hidden` illustration -- and those words are the reason
 * colour is never the only carrier of the step's meaning.
 */
export function learnLoomLiveMessage(
  view: LearnLoomView,
  index: number,
): string {
  if (view === 'reference') return LEARN_LOOM_REFERENCE_TITLE
  const at = learnLoomStepAt(index)
  const step = LEARN_LOOM_STEPS[at]!
  const active = learnLoomSheetViews(step).find((sheet) => sheet.active)!
  // Each part is one spoken sentence. The step's title already ends in a
  // full stop and the other two do not, so the punctuation is added where
  // it is missing rather than appended blindly -- `do.. Brief` is what
  // blind appending sounds like.
  return [learnLoomAnnouncement(at), step.ticketStatus, active.title]
    .map((part) => (part.endsWith('.') ? part : `${part}.`))
    .join(' ')
}

/** Everything one step needs, from its index alone. */
export function learnLoomStepView(index: number): LearnLoomStepView {
  const at = learnLoomStepAt(index)
  const step = LEARN_LOOM_STEPS[at]!
  return {
    step,
    copy: LEARN_LOOM_STEP_COPY[at]!,
    sheets: learnLoomSheetViews(step),
    announcement: learnLoomAnnouncement(at),
    backDisabled: at === LEARN_LOOM_FIRST_STEP,
    isLast: at === LEARN_LOOM_STEP_COUNT - 1,
  }
}
