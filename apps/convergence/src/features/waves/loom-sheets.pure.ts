import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { loomBefore, loomBeforeOlderLine } from './loom-before.pure'
import {
  BLOCKED_ACTION,
  waveLapLabel,
  waveRowAction,
  waveRowHostMarker,
  type WaveRow,
  type WaveRowCrew,
} from './wave-sections.pure'
import { LOOM_SHEET_NAMES, type LoomSheet } from './wave-panel-sheet.pure'
import { loomPlan, loomPlanLeftLine, loomUtcDay } from './loom-plan.pure'
import type { LoomHorse } from './loom-horses.pure'
import { loomNext } from './loom-next.pure'

/**
 * What is on Now, in the four groups the sheet draws (MAR-3189 R2).
 *
 * The names are the questions a person asks of the row: is it moving, does it
 * want my eyes, does it want Fable's verdict, does it want a decision.
 */
export interface LoomNowSheet {
  /** Work a horse is on: `working`. */
  inFlight: WaveRow[]
  /** Work that stopped for Marcin's acceptance: `reviewed`. */
  awaitingQa: WaveRow[]
  /** Work that stopped for a verdict: `returned`. */
  fablesTurn: WaveRow[]
  /** Work the tracker says cannot move until somebody decides: `blocked`. */
  decide: WaveRow[]
}

/** Loom's four sheets (MAR-3189 R2). One result feeds compact and expanded. */
export interface LoomSheets {
  before: WaveRow[]
  now: LoomNowSheet
  next: WaveRow[]
  plan: WaveRow[]
}

/**
 * The rows into the four sheets (MAR-3189 R2): a pure function of the rows,
 * beside `sectionWaveRows` rather than instead of it -- Mission Control's
 * Waves tab still reads the old four sections, and one selector rewritten for
 * two boards would have been two boards changed by this slice.
 *
 * Every row lands in exactly ONE list, and the chain below is what guarantees
 * it. `done` is asked first because the loop has let go of it: a finished
 * issue still carrying a `blocked` label is history, not a decision (the same
 * ordering `sectionWaveRows` takes from MAR-3138 lap 2, A). After that
 * `blocked` outranks the state (MAR-3138 R4) -- the tracker is saying the
 * work cannot move until somebody decides, and that is the same question
 * whatever state the issue is in.
 *
 * `assigned` splits on the seat, and that split is the whole difference
 * between Next and Plan: an issue with a seat is queued at a named horse,
 * while one without is still being shaped.
 */
export function loomSheets(
  rows: readonly WorkLedgerEntry[],
  now: number,
  crewOf: (crewId: string) => WaveRowCrew = () => ({ name: null, cap: null }),
): LoomSheets {
  const sheets: LoomSheets = {
    before: [],
    now: { inFlight: [], awaitingQa: [], fablesTurn: [], decide: [] },
    next: [],
    plan: [],
  }

  for (const entry of rows) {
    const crew = crewOf(entry.crewId)
    const row: WaveRow = {
      entry,
      action: waveRowAction(entry),
      hostMarker: waveRowHostMarker(entry, now),
      crewName: crew.name,
      lapLabel: waveLapLabel(entry.lap, crew.cap),
    }

    if (entry.state === 'done') sheets.before.push(row)
    else if (entry.blocked) {
      // Decide always says what to do (lap 2, E). `waveRowAction` calls an
      // `unassigned` row terminal and gives it no verb -- right for the old
      // sections, where such a row sat in *Waves* asking nothing, and wrong
      // here, where the sheet's whole promise is that somebody owes it a
      // decision. The verb is put back at the point that made the claim,
      // rather than by widening a function four other readers share.
      sheets.now.decide.push(
        row.action === null ? { ...row, action: BLOCKED_ACTION } : row,
      )
    } else if (entry.state === 'working') sheets.now.inFlight.push(row)
    else if (entry.state === 'reviewed') sheets.now.awaitingQa.push(row)
    else if (entry.state === 'returned') sheets.now.fablesTurn.push(row)
    else if (entry.state === 'assigned') {
      if (entry.seat === null) sheets.plan.push(row)
      else sheets.next.push(row)
    }
    // `unassigned` and `stopped`: work nobody is carrying right now. They sit
    // in Plan with the word the row already speaks -- `re-groom (Fable)` for
    // a stopped lap, nothing for an issue that has left the seat group.
    else sheets.plan.push(row)
  }

  return sheets
}

/** The numbers the four titles carry (MAR-3189). */
export interface LoomSheetCounts {
  before: number
  /**
   * Now, minus what is waiting on Marcin: no row of Now goes unnamed.
   *
   * `open`, not `inFlight` (lap 2, F): it counts the rows waiting on a
   * verdict and on a decision too, and neither of those is in flight. A
   * number is only as honest as the word beside it.
   */
  open: number
  awaitingQa: number
  /**
   * Everything queued -- ready and preparing together (MAR-3193 R5).
   *
   * The strip draws this one, and its four numbers are "how much is in each
   * sheet"; splitting it there would change what that column means.
   */
  next: number
  /**
   * Of `next`, what could run now: a seat claims it and it carries the three
   * labels (MAR-3193 R2).
   */
  nextReady: number
  /** Of `next`, what cannot run yet -- including rows no seat claims. */
  nextPreparing: number
  plan: number
}

/**
 * The counts, read off the same sheets the stack draws.
 *
 * `open` is wider than `now.inFlight`: the title says two numbers and the
 * sheet holds four groups, so the two have to cover all four or the title
 * would hide rows. The split is the one a person acts on -- what is mine to
 * look at (`awaitingQa`) against everything else still open, whether it is
 * moving, waiting on a verdict or waiting on a decision.
 */
export function loomSheetCounts(
  sheets: LoomSheets,
  now: number,
  horses: readonly LoomHorse[],
): LoomSheetCounts {
  // Next's split is a fact about SEATS, not only labels (MAR-3193 R5): a row
  // whose `horse ›` label names nobody cannot run however it is labelled, so
  // the horses decide the number as much as the facts do.
  const next = loomNext(sheets.next, horses)
  return {
    // What the sheet SHOWS, from the sheet's own derivation (MAR-3192 R4).
    // `sheets.before` keeps every finished row the ledger ever wrote -- the
    // partition is untouched -- so counting it would put a number over the
    // sheet that no amount of scrolling could reach.
    before: loomBefore(sheets.before, now).shown,
    open:
      sheets.now.inFlight.length +
      sheets.now.fablesTurn.length +
      sheets.now.decide.length,
    awaitingQa: sheets.now.awaitingQa.length,
    next: sheets.next.length,
    nextReady: next.ready,
    nextPreparing: next.preparing,
    // What is being PREPARED (MAR-3194 R5). `sheets.plan` also holds the rows
    // that left the loop -- the partition is untouched -- and those are
    // counted in a sentence, not listed, so counting the list would promise
    // rows the sheet does not draw.
    plan: loomPlan(sheets.plan, loomUtcDay(now)).preparing,
  }
}

/** How many rows a sheet holds, for the empty-sheet note. */
export function loomSheetSize(sheets: LoomSheets, sheet: LoomSheet): number {
  if (sheet === 'before') return sheets.before.length
  if (sheet === 'next') return sheets.next.length
  if (sheet === 'plan') return sheets.plan.length
  return (
    sheets.now.inFlight.length +
    sheets.now.awaitingQa.length +
    sheets.now.fablesTurn.length +
    sheets.now.decide.length
  )
}

/**
 * A sheet's title (MAR-3189): the name, then what its number MEANS. A bare
 * count beside four different words would make the reader guess which four
 * things are being counted.
 */
export function loomSheetTitle(
  sheet: LoomSheet,
  counts: LoomSheetCounts,
): string {
  const name = LOOM_SHEET_NAMES[sheet]
  if (sheet === 'before') return `${name} · ${counts.before} done`
  if (sheet === 'now') {
    return `${name} · ${counts.open} open · ${counts.awaitingQa} awaiting QA`
  }
  if (sheet === 'next') {
    // What a person can act on first, and what is still waiting on a label
    // (MAR-3193 R5). One number when nothing is preparing: a trailing
    // `· 0 preparing` is noise that reads like a warning.
    const ready = `${name} · ${counts.nextReady} ready`
    return counts.nextPreparing > 0
      ? `${ready} · ${counts.nextPreparing} preparing`
      : ready
  }
  return `${name} · ${counts.plan} in preparation`
}

/**
 * The line under a sheet's title, or null when the rows speak for themselves.
 *
 * An empty sheet is rarely one fact, which is why Before and Plan compute
 * theirs: "nothing here" and "nothing here LATELY" read the same and are
 * not, and the note is where the difference is said.
 */
export function loomSheetNote(
  sheet: LoomSheet,
  sheets: LoomSheets,
  now: number,
): string | null {
  if (sheet === 'plan') {
    // Plan reads the whole ledger since LV1, so the sheet no longer has to
    // apologise for a slice that shipped. An empty Plan is still two facts:
    // nothing is being prepared, or nothing is being prepared BECAUSE
    // everything here has left the loop (MAR-3194 R5).
    const { preparing, left } = loomPlan(sheets.plan, loomUtcDay(now))
    if (preparing > 0) return null
    return left > 0
      ? loomPlanLeftLine(left)
      : `Nothing in ${LOOM_SHEET_NAMES.plan} right now.`
  }
  if (sheet === 'before') {
    // An empty Before is two different facts (MAR-3192 R5): nothing has
    // finished, or nothing finished LATELY. Saying "nothing here" about a
    // fortnight of silence that follows a year of work is the sheet
    // forgetting on a person's behalf.
    const { shown, older } = loomBefore(sheets.before, now)
    if (shown > 0) return null
    return older > 0
      ? loomBeforeOlderLine(older)
      : `Nothing in ${LOOM_SHEET_NAMES.before} right now.`
  }
  return loomSheetSize(sheets, sheet) === 0
    ? `Nothing in ${LOOM_SHEET_NAMES[sheet]} right now.`
    : null
}

/**
 * Which ledger this is, under Loom's name (MAR-3189, MAR-3284).
 *
 * The crew whose tracker these rows came from, and nothing else. The app does
 * not hold a tracker project's NAME -- a binding carries `projectId` and
 * nothing else (`TrackerBinding`) -- so the crew's name stands in, the same
 * word the header already uses for an outage.
 *
 * r4 asked for `<project> · All waves` and MAR-3284 took the tail back off:
 * `All waves` was true and said nothing (nothing here has ever been
 * filtered), and the sentence it made turned the crew picker into a control
 * sitting inside a paragraph.
 *
 * One crew, always (MAR-3225): Loom shows the selected crew's ledger and no
 * other, so the `N crews` count had nothing left to describe.
 *
 * No crew: the empty string, not a stand-in phrase. A subline with nothing to
 * name says nothing; the shells keep its box and its spacing either way.
 */
export function loomSubline(crewName: string | null): string {
  return crewName ?? ''
}

/**
 * Now's in-flight list with the cards' own rows taken out (MAR-3191 R4).
 *
 * Every row appears exactly once on the sheet. A `working` row a horse card
 * already names is not listed again below it; a `working` row whose seat
 * matches no horse in the crew STAYS in the list, still saying the thing it
 * already says (`seat not in crew`) -- that row is the interesting one, and
 * dropping it because no card claimed it would hide exactly the work nobody
 * is watching.
 *
 * A card's held row may come from *Decide* instead (lap 2, A) -- a blocked
 * working row -- and it stays listed there, as a `returned` row stays under
 * Fable's turn. That needs no guard HERE: `loomSheets` puts every row in
 * exactly one group, so a row the card took from `decide` is not in this
 * list to begin with, and a `heldFrom` check could never change the answer.
 * The card's own words say where its row came from; this function only ever
 * subtracts what it holds.
 *
 * One function, called by both shapes, so compact and expanded cannot come to
 * different conclusions about what has already been shown.
 */
export function loomNowRows(
  sheets: LoomSheets,
  horses: readonly { held: WaveRow | null }[],
): WaveRow[] {
  const heldKeys = new Set(
    horses.flatMap((horse) =>
      horse.held
        ? [`${horse.held.entry.crewId}:${horse.held.entry.issueId}`]
        : [],
    ),
  )
  return sheets.now.inFlight.filter(
    (row) => !heldKeys.has(`${row.entry.crewId}:${row.entry.issueId}`),
  )
}
