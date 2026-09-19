import type { WaveRow } from './wave-sections.pure'

/**
 * How far back Before looks (MAR-3192 R2).
 *
 * The same fortnight LV1's tracker read uses (`LINEAR_DONE_WINDOW`), and for
 * the same reason -- past it, a finished issue has stopped being news. The
 * two are deliberately separate numbers: the tracker's window decides what
 * the app is TOLD, this one decides what a person is SHOWN, and the ledger
 * between them never rewrites a finished row (MAR-3190 R8), so this sheet
 * would otherwise grow forever.
 */
export const LOOM_BEFORE_WINDOW_DAYS = 14

const WINDOW_MS = LOOM_BEFORE_WINDOW_DAYS * 24 * 60 * 60 * 1000

/**
 * The sentence under the groups (MAR-3192 R5).
 *
 * `done` is one word from one tracker. It is not a claim that anything was
 * built, tagged or published, and a panel that let a reader infer that would
 * be making a promise nothing in this app can keep.
 */
export const LOOM_DONE_IS_NOT_RELEASED =
  'Done is the issue’s tracker status. It does not by itself claim a release was published.'

/**
 * The key of the group for rows with no wave (MAR-3192 R1).
 *
 * Every wave's key carries a `wave:` prefix, so this one cannot collide with
 * any name a person can type. Keying the group by its TITLE would merge a
 * real wave somebody named "No wave" into the unwaved rows -- two different
 * facts under one heading, with no way for a reader to tell them apart.
 */
export const LOOM_NO_WAVE_KEY = 'no-wave'

/** A named wave's key; the prefix is what keeps the two namespaces apart. */
export function loomWaveKey(wave: string): string {
  return `wave:${wave}`
}

/** What the heading calls the rows that carry no wave. */
export const LOOM_NO_WAVE_TITLE = 'No wave'

/** One wave's finished issues, as Before draws them. */
export interface LoomBeforeGroup {
  key: string
  wave: string | null
  title: string
  rows: WaveRow[]
}

/** Before's whole answer: what is shown, and how much is not. */
export interface LoomBefore {
  groups: LoomBeforeGroup[]
  shown: number
  older: number
}

/**
 * When the app wrote this row, as a number -- or the beginning of time.
 *
 * An undatable row sorts LAST rather than first: it is still shown (R2), but
 * it cannot be allowed to claim it is the newest thing that happened and
 * drag its whole wave to the top of the sheet.
 */
function instantOf(row: WaveRow): number {
  const at = Date.parse(row.entry.seenAt)
  return Number.isFinite(at) ? at : Number.NEGATIVE_INFINITY
}

/**
 * Whether this finished row is still inside the window (R2).
 *
 * Both sides are the app's own UTC instants -- `seenAt` as the watcher wrote
 * it, `now` as the panel's clock reads it -- so no timezone enters the
 * comparison and no date is ever formatted to make it.
 *
 * A row whose `seenAt` cannot be parsed is SHOWN. The app does not know when
 * it happened, and hiding what it cannot date would be the sheet claiming an
 * age it does not have; a reader can see the row and judge.
 */
function inWindow(row: WaveRow, now: number): boolean {
  const at = Date.parse(row.entry.seenAt)
  if (!Number.isFinite(at)) return true
  return now - at <= WINDOW_MS
}

/**
 * The finished work of the last fortnight, by wave (MAR-3192).
 *
 * One derivation for the sheet AND its title (R4): the number over the sheet
 * and the rows in it come from this same call, so the two cannot come to
 * disagree about how much a person is looking at.
 */
export function loomBefore(rows: readonly WaveRow[], now: number): LoomBefore {
  const shown = rows.filter((row) => inWindow(row, now))
  const byKey = new Map<string, LoomBeforeGroup>()
  for (const row of shown) {
    const wave = row.entry.wave
    const key = wave === null ? LOOM_NO_WAVE_KEY : loomWaveKey(wave)
    const group = byKey.get(key)
    if (group) group.rows.push(row)
    else {
      byKey.set(key, {
        key,
        wave,
        title: wave ?? LOOM_NO_WAVE_TITLE,
        rows: [row],
      })
    }
  }

  const groups = [...byKey.values()]
  for (const group of groups) {
    group.rows.sort((a, b) => instantOf(b) - instantOf(a))
  }
  groups.sort((a, b) => {
    // Newest wave first: what a person wants from "what was before" is the
    // work that just finished, not the wave that happens to be biggest.
    const byNewest = instantOf(b.rows[0]!) - instantOf(a.rows[0]!)
    if (byNewest !== 0) return byNewest
    // A tie is two waves finishing in the same millisecond; the unwaved
    // group goes last, because it is the absence of the thing being grouped.
    if (a.wave === null) return 1
    if (b.wave === null) return -1
    return a.wave.localeCompare(b.wave)
  })

  return { groups, shown: shown.length, older: rows.length - shown.length }
}

/** `5 older issues not shown`, or null when nothing is hidden (R5). */
export function loomBeforeOlderLine(older: number): string | null {
  if (older <= 0) return null
  return `${older} older issue${older === 1 ? '' : 's'} not shown`
}
