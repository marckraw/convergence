import type {
  TrackerHealth,
  WorkLedgerEntry,
  WorkLedgerSnapshot,
} from '@/entities/work-ledger'
import { livenessAge } from '@/shared/lib/host-liveness.pure'

/** The group rows without a wave fall into, shown last. */
export const UNWAVED_GROUP = '—'

/** One row as the panel draws it: the ledger's facts plus derived words. */
export interface WaveRow {
  entry: WorkLedgerEntry
  /** What a person does next, derived from the row's state (R2). */
  action: string | null
  /**
   * The seat's host is not answering (lap 2, F1): a second marker beside the
   * action, never in its place, and only on work that has started.
   */
  hostMarker: string | null
  /** The row's crew, named only when more than one crew is bound (lap 2, E). */
  crewName: string | null
  /**
   * Which lap this is (MAR-3085 R7): `lap 2`.
   *
   * `waveLapLabel` can also say `lap 2 of 6`, but that branch is INERT on
   * screen: the board passes no cap (lap 2, E), because the only number a
   * crew carries today is `roundCap` -- a hop budget for one flow run, not a
   * bound on an issue's laps. A true lap cap rides MAR-3149, and this is the
   * one place it will arrive.
   */
  lapLabel: string
}

/** A row's crew, as the board reads it (MAR-3085 R7). */
export interface WaveRowCrew {
  name: string | null
  /**
   * A cap on this issue's laps, or null for none -- which is what the board
   * passes today (lap 2, E; MAR-3149). Never `roundCap`: that is a hop
   * budget for a crew's flow run, in a different unit from a lap.
   */
  cap: number | null
}

export interface WaveGroup {
  wave: string
  rows: WaveRow[]
}

/** The four sections (R1). One result feeds the panel, the rail and the tab. */
export interface WaveSections {
  waitingOnYou: WaveRow[]
  inTheWave: WaveRow[]
  waitingToStart: WaveRow[]
  waves: WaveGroup[]
}

/** What a blocked row asks for, in any LIVE state (MAR-3138 R4). */
export const BLOCKED_ACTION = 'decide'

/**
 * A row the loop has let go of (MAR-3138 lap 2, A): `done` and `unassigned`.
 *
 * Terminal is not "finished well", it is "the loop has let go": nobody will
 * act on a `done` issue, and an `unassigned` one has left the seat group --
 * `diffTrackerSnapshot` writes no further row for it and the seat-group query
 * no longer returns it, so an ask put on it could never be answered (removing
 * the `blocked` label in Linear would not even reach the ledger). A `done`
 * issue still labeled is read every tick, but a decision on finished work is
 * not a decision. A terminal row therefore asks for nothing and sits in
 * *Waves* alone, whatever facts it carries.
 */
export function isTerminalWaveRow(
  entry: Pick<WorkLedgerEntry, 'state'>,
): boolean {
  return entry.state === 'done' || entry.state === 'unassigned'
}

/**
 * The human action on a row (R2), from its state: a reviewed issue waits on
 * Marcin's QA, a returned one on Fable's verdict, and a working one whose
 * seat has no conversation in the crew cannot be reached.
 *
 * A terminal row is asked about FIRST (lap 2, A): nothing can be done about
 * it, so it asks for nothing. After that `blocked` outranks the state
 * (MAR-3138 R4) -- the tracker is saying the work cannot move until somebody
 * decides, and that is the same question in every live state, which is why
 * the answer is one word and not six.
 */
export function waveRowAction(entry: WorkLedgerEntry): string | null {
  if (isTerminalWaveRow(entry)) return null
  if (entry.blocked) return BLOCKED_ACTION
  if (entry.state === 'reviewed') return 'QA and say done'
  if (entry.state === 'returned') return 'verdict (Fable)'
  // A STOP parks the lap until somebody grooms the issue again (MAR-3085 R7).
  if (entry.state === 'stopped') return 're-groom (Fable)'
  if (entry.state === 'working' && entry.sessionId === null) {
    return 'seat not in crew'
  }
  return null
}

/**
 * The host outage on a row (lap 2, F1): only on `working` and `returned` --
 * work that is on a host. An `assigned` issue has not started anywhere, so a
 * host that is down says nothing about it.
 */
export function waveRowHostMarker(
  entry: WorkLedgerEntry,
  now: number,
): string | null {
  if (entry.state !== 'working' && entry.state !== 'returned') return null
  if (!entry.hostLiveness || entry.hostLiveness.hostReachable) return null
  const age = livenessAge(entry.hostLiveness.lastEventAt, now)
  return age === null ? 'host unreachable' : `host unreachable since ${age}`
}

/** How a row says which lap it is on (MAR-3085 R7). */
export function waveLapLabel(lap: number, cap: number | null): string {
  return cap === null ? `lap ${lap}` : `lap ${lap} of ${cap}`
}

/**
 * The rows into the four sections (R1): a pure function of the rows.
 *
 * *Waiting on you* is `reviewed` and every `blocked` row in a LIVE state
 * (MAR-3138 R4: a decision is a decision in any live state, and the row lands
 * there ONCE rather than in both sections); *In the wave* is `working`,
 * `returned` and `stopped` (MAR-3085: a parked lap is still work somebody
 * picks up); *Waiting to start* is `assigned`; *Waves* groups every row by
 * its wave, unwaved rows last. `done` and `unassigned` appear in *Waves*
 * only -- including the blocked ones (lap 2, A).
 */
export function sectionWaveRows(
  rows: readonly WorkLedgerEntry[],
  now: number,
  crewOf: (crewId: string) => WaveRowCrew = () => ({ name: null, cap: null }),
): WaveSections {
  const sections: WaveSections = {
    waitingOnYou: [],
    inTheWave: [],
    waitingToStart: [],
    waves: [],
  }
  const groups = new Map<string, WaveRow[]>()

  for (const entry of rows) {
    const crew = crewOf(entry.crewId)
    const row: WaveRow = {
      entry,
      action: waveRowAction(entry),
      hostMarker: waveRowHostMarker(entry, now),
      crewName: crew.name,
      lapLabel: waveLapLabel(entry.lap, crew.cap),
    }
    // Blocked outranks the state (MAR-3138 R4) but not the end of the line
    // (lap 2, A): a terminal row falls through to its wave group and asks for
    // nothing. The chain is what keeps every other row out of a second
    // section.
    if (
      !isTerminalWaveRow(entry) &&
      (entry.blocked || entry.state === 'reviewed')
    ) {
      sections.waitingOnYou.push(row)
    } else if (
      entry.state === 'working' ||
      entry.state === 'returned' ||
      // A stopped lap is still in the wave: it is work somebody has to pick
      // up again, not work waiting on Marcin (MAR-3085 R7).
      entry.state === 'stopped'
    ) {
      sections.inTheWave.push(row)
    } else if (entry.state === 'assigned') sections.waitingToStart.push(row)

    const wave = entry.wave ?? UNWAVED_GROUP
    const group = groups.get(wave)
    if (group) group.push(row)
    else groups.set(wave, [row])
  }

  sections.waves = [...groups.entries()]
    .map(([wave, groupRows]) => ({ wave, rows: groupRows }))
    .sort((a, b) =>
      a.wave === UNWAVED_GROUP
        ? 1
        : b.wave === UNWAVED_GROUP
          ? -1
          : a.wave.localeCompare(b.wave),
    )
  return sections
}

/** The board's own line for the Waves tab (lap 2, D), from the same sections. */
export function waveBoardLine(sections: WaveSections): string {
  const issues = sections.waves.reduce(
    (count, group) => count + group.rows.length,
    0,
  )
  return `${issues} issue${issues === 1 ? '' : 's'} · ${sections.waitingOnYou.length} waiting on you`
}

/** The rows of every bound crew's last snapshot, in crew order. */
export function waveRowsFromSnapshots(
  snapshots: Readonly<Record<string, WorkLedgerSnapshot>>,
  boundCrewIds: readonly string[],
): WorkLedgerEntry[] {
  return boundCrewIds.flatMap((crewId) => snapshots[crewId]?.entries ?? [])
}

const OUTAGE_LABELS: Record<Exclude<TrackerHealth['state'], 'ok'>, string> = {
  unreachable: 'tracker unreachable',
  unauthorized: 'tracker key refused',
  'rate-limited': 'tracker rate-limited',
  'bad-response': 'tracker answered badly',
  'project-not-visible': 'tracker project not visible to this key',
}

export type WaveHeader =
  | { kind: 'connect'; text: string }
  | { kind: 'outage'; text: string }
  | { kind: 'reading'; text: string }
  | { kind: 'quiet'; text: string }
  | { kind: 'live'; text: null }

/** One bound crew, as the header reads it. */
export interface WaveHeaderCrew {
  name: string
  health: TrackerHealth | null
}

/**
 * What the panel's header says (R3).
 *
 * An outage is an age, never a zero, and it names each crew whose tracker is
 * not answering when more than one is bound (lap 2, E). "Quiet" is a claim
 * about a tracker that answered (lap 2, A): while any bound crew has not been
 * heard from, the header reads "reading the tracker…" and the rows already
 * held still render. No binding at all asks to connect one.
 */
export function waveHeader(input: {
  crews: readonly WaveHeaderCrew[]
  rowCount: number
  now: number
}): WaveHeader {
  if (input.crews.length === 0) {
    return { kind: 'connect', text: 'Connect a tracker' }
  }
  const several = input.crews.length > 1
  const outages = input.crews.flatMap((crew) => {
    const health = crew.health
    if (health === null || health.state === 'ok') return []
    const age = livenessAge(health.since, input.now)
    return [
      [OUTAGE_LABELS[health.state], several ? crew.name : null, age]
        .filter((part): part is string => part !== null)
        .join(' · '),
    ]
  })
  if (outages.length > 0) return { kind: 'outage', text: outages.join('; ') }
  if (input.crews.some((crew) => crew.health === null)) {
    return { kind: 'reading', text: 'reading the tracker…' }
  }
  if (input.rowCount === 0) return { kind: 'quiet', text: 'Quiet project' }
  return { kind: 'live', text: null }
}

/** Whether a row can open its seat, from one session lookup (lap 2, F4). */
export type WaveRowOpening<T> =
  | { openable: true; session: T }
  | { openable: false; reason: string }

/**
 * A row's seat, resolved once (R5): the conversation to open, or why there is
 * none -- no session on the row, or one this window has not loaded.
 */
export function resolveWaveRow<T>(
  entry: Pick<WorkLedgerEntry, 'sessionId'>,
  findSession: (sessionId: string) => T | null,
): WaveRowOpening<T> {
  if (entry.sessionId === null) {
    return { openable: false, reason: 'no conversation for this seat' }
  }
  const session = findSession(entry.sessionId)
  return session === null
    ? { openable: false, reason: 'conversation not loaded' }
    : { openable: true, session }
}

/** The row's key on the page: unique across crews (lap 2, E). */
export function waveRowKey(
  entry: Pick<WorkLedgerEntry, 'crewId' | 'issueIdentifier'>,
): string {
  return `${entry.crewId}:${entry.issueIdentifier}`
}

/** The narrowest main panel the docked column leaves (lap 2, B). */
export const WAVE_PANEL_MIN_MAIN_WIDTH = 480

/**
 * The column's width, in pixels (MAR-3155; MAR-3189 R4): a preference, not a
 * fact.
 *
 * The floor is where a row stops being readable at all -- narrower than this
 * the identifier and the title fight over the same line. The ceiling is where
 * the column stops being a column beside the conversation and starts being a
 * second page: past it the answer is Expand, which gives Loom the whole
 * content area, rather than a wider and wider rail. Loom's design (r4) draws
 * the compact stack between these two numbers and nowhere else.
 */
export const WAVE_PANEL_MIN_COLUMN_WIDTH = 280
export const WAVE_PANEL_MAX_COLUMN_WIDTH = 400
export const WAVE_PANEL_DEFAULT_COLUMN_WIDTH = 280
/** One arrow key's worth of resize (R4). */
export const WAVE_PANEL_WIDTH_STEP = 16

/**
 * A width into the range the column may actually take right now.
 *
 * `max` is the caller's, because the ceiling moves with the window: a wide
 * preference in a narrow window is honoured as far as it fits and no further,
 * and what was preferred is NOT rewritten (MAR-3155 R2). The LAW's ceiling is
 * applied here too (MAR-3189 R4), so a caller cannot widen the column past
 * 400 by passing a bigger `max` -- every caller's max is already at or below
 * it, and this is what keeps that true rather than merely observed.
 */
export function clampWavePanelWidth(width: number, max: number): number {
  const ceiling = Math.max(
    WAVE_PANEL_MIN_COLUMN_WIDTH,
    Math.min(WAVE_PANEL_MAX_COLUMN_WIDTH, max),
  )
  return Math.min(ceiling, Math.max(WAVE_PANEL_MIN_COLUMN_WIDTH, width))
}

/**
 * What a finished resize gesture stores (MAR-3161 R1).
 *
 * Pattern: Decision — store nothing iff storing nothing would show the same
 * width. The drag and the step ask this at the moment they end, with that
 * moment's ceiling; comparing to the width when the gesture began is a
 * different question (and wrong when the ceiling moves mid-drag).
 */
export function settleWavePanelGesture(input: {
  requested: number
  storedWidth: number
  maxWidth: number
}): number | null {
  const result = Math.round(
    clampWavePanelWidth(input.requested, input.maxWidth),
  )
  const fallback = Math.round(
    clampWavePanelWidth(input.storedWidth, input.maxWidth),
  )
  return result === fallback ? null : result
}

/**
 * What Loom renders as (MAR-3189 R1/R4/R5), as one of three shapes rather
 * than four independent fields.
 *
 * A union, so no caller can reach a compact column with no width and reach
 * for a fallback the decision never gave (MAR-3155 lap 2, B). Only `compact`
 * has a width and a ceiling; the strip is too narrow to have one and the
 * expanded stack takes the content area it is given.
 *
 * `strip` carries no reason field any more: with the stored mode reduced to
 * `compact | expanded` (MAR-3189), the only thing that can put the strip on
 * screen is a window too narrow for the column. The reason IS the shape.
 */
export type WavePanelModeDecision =
  | {
      mode: 'strip'
      width: null
      maxWidth: null
    }
  | {
      mode: 'compact'
      /**
       * The width the column renders at: the decision's own number, never the
       * stored one, which is what keeps a narrow window from quietly becoming
       * a preference.
       */
      width: number
      /**
       * The widest this window can show right now (MAR-3155 lap 2, B). The
       * ceiling's arithmetic lives HERE and only here -- a caller that
       * computed its own would be the second encoding R6 exists to prevent --
       * and it is what the handle announces.
       */
      maxWidth: number
    }
  | {
      mode: 'expanded'
      width: null
      maxWidth: null
    }

/**
 * The shape and the width Loom renders in (MAR-3189 R4/R5): the stored ones,
 * unless the window is too narrow for a readable column beside a readable
 * conversation -- in which case a narrower column first, and only then the
 * strip. Neither the mode nor the width is written back.
 *
 * The expanded stack is asked FIRST and is never refused: it does not stand
 * beside the main panel, it IS the main panel (R5), so the window arithmetic
 * that can starve the column says nothing about it.
 */
export function effectiveWavePanelMode(input: {
  stored: 'compact' | 'expanded'
  /** What the person last chose; may be wider than the window allows. */
  storedWidth: number
  windowWidth: number
  reservedWidth: number
}): WavePanelModeDecision {
  if (input.stored === 'expanded') {
    return { mode: 'expanded', width: null, maxWidth: null }
  }
  // What the window can spare for the column, once the main panel has its
  // floor. Below the column's own floor there is no readable column left, and
  // only then does the strip take over (MAR-3155 R1).
  const available =
    input.windowWidth - input.reservedWidth - WAVE_PANEL_MIN_MAIN_WIDTH
  if (available < WAVE_PANEL_MIN_COLUMN_WIDTH) {
    return { mode: 'strip', width: null, maxWidth: null }
  }
  const maxWidth = Math.min(WAVE_PANEL_MAX_COLUMN_WIDTH, available)
  return {
    mode: 'compact',
    width: clampWavePanelWidth(input.storedWidth, maxWidth),
    maxWidth,
  }
}
