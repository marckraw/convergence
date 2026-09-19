import type { WaveRow } from './wave-sections.pure'

/**
 * How long a grounding is treated as current (MAR-3194 R4).
 *
 * A grounding is a claim about the code as it stood on a day. A week of
 * merges later it is a description of a repository that no longer exists,
 * and a sheet that kept calling it "grounded" would be vouching for it.
 */
export const LOOM_GROUNDING_FRESH_DAYS = 7

/**
 * The sentence under the stages (MAR-3194 R5).
 *
 * Marcin's design ruling: Plan looks, it does not touch. The sentence is
 * there so a reader stops hunting for the button that is deliberately absent.
 */
export const LOOM_PLAN_IS_READ_ONLY =
  'Prepared through the mastermind or in Linear — nothing here edits an issue.'

/** Which preparation stage a row is in; the render order is this order. */
export type LoomPlanStageKey = 'define' | 'ground' | 'assign' | 'regroom'

/** One stage of preparation, as Plan draws it. */
export interface LoomPlanStage {
  key: LoomPlanStageKey
  title: string
  hint: string
  rows: WaveRow[]
}

/** Plan's whole answer: what is being prepared, and how much is not here. */
export interface LoomPlan {
  stages: LoomPlanStage[]
  preparing: number
  left: number
}

/**
 * The stages, in the order preparation happens (MAR-3194 R3).
 *
 * Each hint is the stage's job in one line, because the titles are the
 * loop's own vocabulary and a person reading the panel for the first time
 * has no reason to know what "ground" means here.
 */
const STAGES: readonly {
  key: LoomPlanStageKey
  title: string
  hint: string
}[] = [
  {
    key: 'define',
    title: 'Define',
    hint: 'Clarify intent and acceptance',
  },
  {
    key: 'ground',
    title: 'Ground in code',
    hint: 'Check the proposal against current code',
  },
  {
    key: 'assign',
    title: 'Assign & clear',
    hint: 'Choose the horse, then clear it to run',
  },
  {
    key: 'regroom',
    title: 'Re-groom',
    hint: 'A lap stopped — the issue goes back to grooming',
  },
]

/**
 * The app's own UTC day, `YYYY-MM-DD`, from the clock the panel already ticks.
 *
 * Derived from the board's `now` rather than read separately, so the date the
 * sheet ages a grounding against and the instant the rest of the panel is
 * drawn at can never be two different days (MAR-3192's `now` is that clock).
 */
export function loomUtcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** A `YYYY-MM-DD` calendar date as a UTC instant, or null if it is not one. */
function dayInstant(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const at = Date.parse(`${day}T00:00:00.000Z`)
  return Number.isFinite(at) ? at : null
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How old a grounding is, in words (MAR-3194 R4).
 *
 * Two clocks meet here and the function exists to keep them apart: the
 * `Grounded at` date is written by a person in whatever zone they are in,
 * `today` is the app's UTC day. Both are read as CALENDAR dates pinned to
 * UTC midnight, so the subtraction is a count of days and no zone offset can
 * turn it into an off-by-one.
 *
 * A grounding dated tomorrow is not an error to report: it is a person east
 * of UTC writing after their local midnight. It reads `grounded today`,
 * never a negative age.
 */
export function loomGroundingWords(
  groundedAt: string | null,
  today: string,
): string {
  if (groundedAt === null) return 'grounding date not recorded'
  const from = dayInstant(groundedAt)
  const to = dayInstant(today)
  // A date the app cannot read is a date the app does not know. Guessing a
  // number from it would put an age on screen that no record supports.
  if (from === null || to === null) return 'grounding date not recorded'
  const days = Math.max(0, Math.round((to - from) / DAY_MS))
  if (days > LOOM_GROUNDING_FRESH_DAYS) {
    return `grounding expired · ${days} days`
  }
  if (days === 0) return 'grounded today'
  return `grounded ${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * What this row lacks, in the row's own word (MAR-3194 R2).
 *
 * `groom-me` is said back verbatim when the issue asks for it: the label is a
 * request a person made, and the sheet repeating it is how they see it landed.
 */
function planAction(
  stage: LoomPlanStageKey,
  row: WaveRow,
  today: string,
): string | null {
  if (stage === 'define') {
    return row.entry.fact.groomMe === true ? 'groom-me' : 'not groomed'
  }
  if (stage === 'ground') return 'not grounded'
  if (stage === 'assign') {
    const words = loomGroundingWords(row.entry.groundedAt, today)
    return `no horse assigned · ${words}`
  }
  // Re-groom keeps the verb the row already carries (`re-groom (Fable)`):
  // that word is the STOP's own, and this sheet is not the place to restate
  // a ruling in different words.
  return row.action
}

/**
 * Which stage a row belongs to, or null for a row that left the loop.
 *
 * The order of the questions is the rule (R1): `groomed` is asked BEFORE
 * `grounded`, because an issue can carry a `grounded` label while nobody has
 * groomed it -- labels are added by hand, in any order -- and reading them
 * the other way round would file an undefined issue under "ready to assign".
 */
function stageOf(row: WaveRow): LoomPlanStageKey | null {
  const { entry } = row
  if (entry.state === 'unassigned') return null
  if (entry.state === 'stopped') return 'regroom'
  if (entry.fact.groomed !== true) return 'define'
  if (entry.fact.grounded !== true) return 'ground'
  return 'assign'
}

/**
 * The issues still being prepared, by stage (MAR-3194).
 *
 * One derivation for the sheet AND its title (R5), as LV3 does for Before:
 * `sheets.plan` also holds the rows that LEFT the loop, which are counted
 * and not listed, so a title counting the list would promise rows that are
 * not on the sheet.
 */
export function loomPlan(rows: readonly WaveRow[], today: string): LoomPlan {
  const byStage = new Map<LoomPlanStageKey, WaveRow[]>()
  let left = 0

  for (const row of rows) {
    const stage = stageOf(row)
    if (stage === null) {
      left += 1
      continue
    }
    // A copy with the word set, never a mutation of the shared row and never
    // a wider `waveRowAction`: four other readers use that function, and the
    // sentence "what this issue lacks" is only true inside Plan.
    const said: WaveRow = { ...row, action: planAction(stage, row, today) }
    const list = byStage.get(stage)
    if (list) list.push(said)
    else byStage.set(stage, [said])
  }

  const stages = STAGES.flatMap((stage) => {
    const stageRows = byStage.get(stage.key)
    return stageRows ? [{ ...stage, rows: stageRows }] : []
  })

  return {
    stages,
    preparing: stages.reduce((sum, stage) => sum + stage.rows.length, 0),
    left,
  }
}

/** `4 issues left the loop`, or null when none did (R5). */
export function loomPlanLeftLine(left: number): string | null {
  if (left <= 0) return null
  return `${left} issue${left === 1 ? '' : 's'} left the loop`
}
