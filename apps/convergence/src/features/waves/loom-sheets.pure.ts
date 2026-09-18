import type { WorkLedgerEntry } from '@/entities/work-ledger'
import {
  BLOCKED_ACTION,
  waveLapLabel,
  waveRowAction,
  waveRowHostMarker,
  type WaveRow,
  type WaveRowCrew,
} from './wave-sections.pure'
import { LOOM_SHEET_NAMES, type LoomSheet } from './wave-panel-sheet.pure'

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
  next: number
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
export function loomSheetCounts(sheets: LoomSheets): LoomSheetCounts {
  return {
    before: sheets.before.length,
    open:
      sheets.now.inFlight.length +
      sheets.now.fablesTurn.length +
      sheets.now.decide.length,
    awaitingQa: sheets.now.awaitingQa.length,
    next: sheets.next.length,
    plan: sheets.plan.length,
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
  if (sheet === 'next') return `${name} · ${counts.next} queued`
  return `${name} · ${counts.plan} in preparation`
}

/** What Plan cannot say yet, and says instead of pretending (MAR-3189). */
export const LOOM_PLAN_NOTE = 'Plan needs the wider read (LV1)'

/**
 * The line under a sheet's title, or null when the rows speak for themselves.
 *
 * Plan always carries its note: today it can only hold `assigned` issues with
 * no seat, which is not what a plan is -- the wider read is LV1's, and saying
 * so is honest where an empty sheet would read as "nothing is planned".
 */
export function loomSheetNote(
  sheet: LoomSheet,
  sheets: LoomSheets,
): string | null {
  if (sheet === 'plan') return LOOM_PLAN_NOTE
  return loomSheetSize(sheets, sheet) === 0
    ? `Nothing in ${LOOM_SHEET_NAMES[sheet]} right now.`
    : null
}

/**
 * Which ledger this is, under Loom's name (MAR-3189).
 *
 * r4 asks for `<project> · All waves`. The app does not hold a tracker
 * project's NAME -- a binding carries `projectId` and nothing else
 * (`TrackerBinding`) -- so the honest stand-in is the crew whose tracker
 * these rows came from, which is the same word the header already uses for an
 * outage. `All waves` is a statement of fact until LV3 gives Before its wave
 * grouping: nothing here is filtered.
 */
export function loomSubline(crewNames: readonly string[]): string {
  if (crewNames.length === 0) return 'All waves'
  if (crewNames.length === 1) return `${crewNames[0]} · All waves`
  return `${crewNames.length} crews · All waves`
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
 * A seat's `returned` row is different and deliberately so: the card NAMES it
 * ("lap N returned · Fable's turn") and the row also stays under Fable's turn.
 * That is one fact shown where each reader needs it -- the seat's card answers
 * "what is this horse on?", the section answers "what do I owe a verdict on?"
 * -- not a row counted twice; `loomSheetCounts` is unchanged and still counts
 * it once.
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
