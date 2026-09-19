import type { WorkLedgerEntry } from '@/entities/work-ledger'
import type {
  TrackerOutsideIssue,
  TrackerOutsideSnapshot,
} from '@/shared/types/tracker.types'
import { livenessAge } from '@/shared/lib/host-liveness.pure'
import {
  loomHorsesLine,
  LOOM_NO_HORSES_LINE,
  type LoomHorse,
} from './loom-horses.pure'
import { LOOM_BEFORE_WINDOW_DAYS } from './loom-before.pure'
import { loomSheetSize, type LoomSheets } from './loom-sheets.pure'
import {
  LOOM_SHEETS,
  LOOM_SHEET_NAMES,
  type LoomSheet,
} from './wave-panel-sheet.pure'

/**
 * Loom's search (MAR-3234): one query over the selected crew's whole Loom --
 * every sheet, the buckets that are otherwise only counted, and the issues
 * outside the loop. A view filter: nothing here is stored or asked of the
 * tracker.
 */

/**
 * How long the filter waits after the last keystroke (R10), trailing edge.
 *
 * The field's own text is never delayed -- only the derivation that follows
 * it. Clearing and Enter apply at once; this number is only ever the price
 * of typing.
 */
export const LOOM_SEARCH_DEBOUNCE_MS = 200

/** A typed query as the filter reads it: trimmed, and `null` when empty. */
export function normalizeLoomQuery(raw: string): string | null {
  const query = raw.trim()
  return query === '' ? null : query
}

const DIGITS = /^\d+$/

/**
 * Whether an issue answers a query (R1).
 *
 * Case-insensitive substring of the title, or of the identifier -- except
 * that a query of digits alone is a NUMBER, and matches the identifier only
 * when it equals or prefixes the identifier's number: `32` finds `MAR-3233`
 * and `MAR-3200`, never `MAR-1320`. Substring over the identifier would make
 * every short number find a hundred issues whose number merely contains it.
 */
function issueMatches(
  identifier: string,
  title: string,
  query: string,
): boolean {
  const needle = query.toLowerCase()
  if (title.toLowerCase().includes(needle)) return true
  if (DIGITS.test(needle)) {
    const number = /(\d+)$/.exec(identifier)?.[1]
    return number !== undefined && number.startsWith(needle)
  }
  return identifier.toLowerCase().includes(needle)
}

/** Whether a ledger row answers the query (R1). */
export function loomRowMatches(entry: WorkLedgerEntry, query: string): boolean {
  return issueMatches(entry.issueIdentifier, entry.issueTitle, query)
}

/** Whether an issue outside the loop answers the query (R1, R5). */
export function loomOutsideMatches(
  issue: TrackerOutsideIssue,
  query: string,
): boolean {
  return issueMatches(issue.identifier, issue.title, query)
}

/**
 * The rows every sheet is derived from (R2): the matching ones, or -- with no
 * query -- the very same array, so an unsearched Loom is today's Loom by
 * identity and not merely by value.
 */
export function loomSearchRows(
  rows: readonly WorkLedgerEntry[],
  query: string | null,
): readonly WorkLedgerEntry[] {
  if (query === null) return rows
  return rows.filter((entry) => loomRowMatches(entry, query))
}

/** Where the matches are, read off the already-filtered sheets (R3, R5). */
export interface LoomSearchSummary {
  total: number
  /**
   * Every match a sheet LISTS while a query is active, including the rows it
   * otherwise only counts -- left the loop, older than the window -- and, for
   * Plan, the matching issues inside "Not in the loop".
   */
  bySheet: Record<LoomSheet, number>
  /** The other sheets holding a match, in the stack's order (R3). */
  elsewhere: Array<{ sheet: LoomSheet; count: number }>
  /** Nothing matches anywhere Loom can look (R5). */
  notFound: boolean
}

export function loomSearchSummary(input: {
  sheets: LoomSheets
  outside: TrackerOutsideSnapshot | null
  query: string
  open: LoomSheet
}): LoomSearchSummary {
  const outside =
    input.outside === null
      ? 0
      : input.outside.issues.filter((issue) =>
          loomOutsideMatches(issue, input.query),
        ).length
  const bySheet = {} as Record<LoomSheet, number>
  for (const sheet of LOOM_SHEETS) {
    bySheet[sheet] =
      loomSheetSize(input.sheets, sheet) + (sheet === 'plan' ? outside : 0)
  }
  const total = LOOM_SHEETS.reduce((sum, sheet) => sum + bySheet[sheet], 0)
  return {
    total,
    bySheet,
    elsewhere: LOOM_SHEETS.filter(
      (sheet) => sheet !== input.open && bySheet[sheet] > 0,
    ).map((sheet) => ({ sheet, count: bySheet[sheet] })),
    notFound: total === 0,
  }
}

/** `No match in Now — `, the words before the one-click answers (R3). */
export function loomSearchElsewherePrefix(open: LoomSheet): string {
  return `No match in ${LOOM_SHEET_NAMES[open]} — `
}

/** `1 in Plan`: one answer, drawn as the button that opens that sheet. */
export function loomSearchElsewhereLabel(place: {
  sheet: LoomSheet
  count: number
}): string {
  return `${place.count} in ${LOOM_SHEET_NAMES[place.sheet]}`
}

/**
 * The one sentence for "nowhere" (R5): what Loom searched, and why an issue
 * can be absent from it.
 *
 * The outside clause only when an outside read exists -- a claim about a list
 * the app has never read would be a sentence nothing backs. With several
 * crews bound, the search is still only this crew's, and it says so.
 */
export function loomSearchNowhereLine(input: {
  query: string
  crewName: string | null
  outsideReadAt: string | null
  now: number
  severalCrews: boolean
}): string {
  const whose = input.crewName === null ? 'this crew' : `${input.crewName}'s`
  const parts = [`No issue matches "${input.query}" in ${whose} Loom.`]
  const age = livenessAge(input.outsideReadAt, input.now)
  parts.push(
    age === null
      ? 'Loom reads issues that carry a Loom label.'
      : `Loom reads issues that carry a Loom label; "Not in the loop" lists this project's other open issues, read ${age} ago.`,
  )
  if (input.severalCrews) parts.push('Other crews are not searched.')
  return parts.join(' ')
}

/** What the horses line says when horses exist and none holds a match (R4). */
export const LOOM_SEARCH_NO_HORSE_LINE = 'No horse is on a matching issue'

/**
 * The line above the cards while a query is active (R4): it counts the SHOWN
 * cards. A crew with no horse seats still says so -- "no horse is on a
 * matching issue" about a crew with none would be the wrong reason.
 */
export function loomSearchHorsesLine(
  shown: readonly LoomHorse[],
  all: readonly LoomHorse[],
): string {
  if (all.length === 0) return LOOM_NO_HORSES_LINE
  if (shown.length === 0) return LOOM_SEARCH_NO_HORSE_LINE
  return loomHorsesLine(shown)
}

/**
 * The horses a search shows (R4): a card iff the issue it HOLDS matches.
 *
 * Called on horses derived from the unfiltered sheets -- a horse whose issue
 * does not match is still working on it, and deriving from the filtered rows
 * would have it read "No active ticket" everywhere it is still consulted.
 */
export function loomSearchHorses(
  horses: readonly LoomHorse[],
  query: string | null,
): readonly LoomHorse[] {
  if (query === null) return horses
  return horses.filter(
    (horse) => horse.held !== null && loomRowMatches(horse.held.entry, query),
  )
}

/** The heading over Plan's matching rows that left the loop (R5). */
export const LOOM_SEARCH_LEFT_TITLE = 'Left the loop'

/** The heading over Before's matching rows older than the window (R5). */
export const LOOM_SEARCH_OLDER_TITLE = `Older than ${LOOM_BEFORE_WINDOW_DAYS} days`

/** What a keydown's target is, as far as the `/` shortcut needs to know. */
interface ShortcutTarget {
  tagName?: string
  isContentEditable?: boolean
  getAttribute?: (name: string) => string | null
}

const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * Whether a keydown inside Loom is the `/` that focuses search (R6).
 *
 * Never while a person is typing somewhere -- a `/` in a text field is a
 * character, not a command -- and never with a modifier, which belongs to
 * whatever shortcut the rest of the app gives it. A listbox option is
 * excluded too: the crew list's typeahead reads printable keys.
 */
export function isLoomSearchShortcut(event: {
  key: string
  target: unknown
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}): boolean {
  if (event.key !== '/') return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  const target = (event.target ?? {}) as ShortcutTarget
  if (target.tagName && TEXT_TAGS.has(target.tagName.toUpperCase())) {
    return false
  }
  if (target.isContentEditable) return false
  const role = target.getAttribute?.('role')
  return role !== 'option' && role !== 'listbox'
}
