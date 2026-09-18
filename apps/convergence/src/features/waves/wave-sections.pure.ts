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

/**
 * The human action on a row (R2), from its state alone: a reviewed issue
 * waits on Marcin's QA, a returned one on Fable's verdict, and a working one
 * whose seat has no conversation in the crew cannot be reached.
 */
export function waveRowAction(entry: WorkLedgerEntry): string | null {
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
 * *Waiting on you* is `reviewed` (`blocked` rides MAR-3138); *In the wave* is
 * `working`, `returned` and `stopped` (MAR-3085: a parked lap is still work
 * somebody picks up); *Waiting to start* is `assigned`; *Waves* groups every
 * row by its wave, unwaved rows last. `done` and `unassigned` appear in
 * *Waves* only.
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
    if (entry.state === 'reviewed') sections.waitingOnYou.push(row)
    else if (
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

/** The rail's four counts (R4), read off the same sections. */
export interface WaveRailCounts {
  waitingOnYou: number
  inTheWave: number
  waitingToStart: number
  waves: number
}

export function waveRailCounts(sections: WaveSections): WaveRailCounts {
  return {
    waitingOnYou: sections.waitingOnYou.length,
    inTheWave: sections.inTheWave.length,
    waitingToStart: sections.waitingToStart.length,
    waves: sections.waves.length,
  }
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
/** The open column's width, in pixels. */
export const WAVE_PANEL_COLUMN_WIDTH = 280

/**
 * Why the column is a rail (MAR-3148 R1): because that is what was stored,
 * or because the window cannot hold the column and a readable main panel.
 *
 * The difference is the whole point: a rail somebody chose reopens on a
 * click, and a rail the width forced cannot -- so the control has to say so
 * rather than do nothing.
 */
export type WavePanelRailReason = 'stored' | 'narrow'

export interface WavePanelModeDecision {
  mode: 'open' | 'rail'
  /** Null while the column is open; otherwise why it is not. */
  reason: WavePanelRailReason | null
}

/**
 * The mode the column renders in (lap 2, B): the stored one, unless the
 * window is too narrow to keep the main panel at its floor, in which case the
 * rail -- without touching what is stored.
 */
export function effectiveWavePanelMode(input: {
  stored: 'open' | 'rail'
  windowWidth: number
  reservedWidth: number
}): WavePanelModeDecision {
  // The width is asked FIRST (lap 2, B): the reason has to say why the rail
  // is on screen NOW, not which test happened to run first. A stored rail in
  // a window too narrow for the column read as `stored`, so Open stayed live
  // -- and a click on it rewrote the preference to `open` and opened nothing.
  const main = input.windowWidth - input.reservedWidth - WAVE_PANEL_COLUMN_WIDTH
  if (main < WAVE_PANEL_MIN_MAIN_WIDTH) {
    return { mode: 'rail', reason: 'narrow' }
  }
  return input.stored === 'rail'
    ? { mode: 'rail', reason: 'stored' }
    : { mode: 'open', reason: null }
}
