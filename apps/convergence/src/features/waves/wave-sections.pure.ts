import type {
  TrackerHealth,
  WorkLedgerEntry,
  WorkLedgerSnapshot,
} from '@/entities/work-ledger'
import { livenessAge } from '@/shared/lib/host-liveness.pure'

/** The group rows without a wave fall into, shown last. */
export const UNWAVED_GROUP = '—'

/** One row as the panel draws it: the ledger's facts plus a derived action. */
export interface WaveRow {
  entry: WorkLedgerEntry
  /** What a person does next, derived from the row (R2); null when nothing. */
  action: string | null
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
 * The human action on a row (R2), from the ledger's facts alone: a reviewed
 * issue waits on Marcin's QA, a returned one on Fable's verdict, a working
 * one whose seat has no conversation in the crew cannot be reached, and a
 * reachable-host fact that says otherwise is named with its age.
 */
export function waveRowAction(
  entry: WorkLedgerEntry,
  now: number,
): string | null {
  if (entry.state === 'reviewed') return 'QA and say done'
  if (entry.state === 'returned') return 'verdict (Fable)'
  if (entry.state === 'working' && entry.sessionId === null) {
    return 'seat not in crew'
  }
  if (entry.hostLiveness && !entry.hostLiveness.hostReachable) {
    const age = livenessAge(entry.hostLiveness.lastEventAt, now)
    return age === null ? 'host unreachable' : `host unreachable since ${age}`
  }
  return null
}

/**
 * The rows into the four sections (R1): a pure function of the rows.
 *
 * *Waiting on you* is `reviewed` (`blocked` rides MAR-3138); *In the wave* is
 * `working` and `returned`; *Waiting to start* is `assigned`; *Waves* groups
 * every row by its wave, unwaved rows last. `done` and `unassigned` appear in
 * *Waves* only.
 */
export function sectionWaveRows(
  rows: readonly WorkLedgerEntry[],
  now: number,
): WaveSections {
  const sections: WaveSections = {
    waitingOnYou: [],
    inTheWave: [],
    waitingToStart: [],
    waves: [],
  }
  const groups = new Map<string, WaveRow[]>()

  for (const entry of rows) {
    const row: WaveRow = { entry, action: waveRowAction(entry, now) }
    if (entry.state === 'reviewed') sections.waitingOnYou.push(row)
    else if (entry.state === 'working' || entry.state === 'returned') {
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
  | { kind: 'quiet'; text: string }
  | { kind: 'live'; text: null }

/**
 * What the panel's header says (R3). An outage is an age, never a zero: it
 * names the state the snapshot carries with the age of `since`, and the rows
 * stay as last read. No binding at all asks to connect one; a binding with no
 * rows is a quiet project.
 */
export function waveHeader(input: {
  boundCrewCount: number
  healths: readonly (TrackerHealth | null)[]
  rowCount: number
  now: number
}): WaveHeader {
  if (input.boundCrewCount === 0) {
    return { kind: 'connect', text: 'Connect a tracker' }
  }
  const outage = input.healths.find(
    (health): health is TrackerHealth =>
      health !== null && health.state !== 'ok',
  )
  if (outage && outage.state !== 'ok') {
    const age = livenessAge(outage.since, input.now)
    const label = OUTAGE_LABELS[outage.state]
    return { kind: 'outage', text: age === null ? label : `${label} · ${age}` }
  }
  if (input.rowCount === 0) return { kind: 'quiet', text: 'Quiet project' }
  return { kind: 'live', text: null }
}

/**
 * Why a row cannot open its seat, or null when it can (R5): a row without a
 * session has no conversation to open, and one whose session this window has
 * not loaded is named rather than silently dead.
 */
export function waveRowInertReason(
  entry: Pick<WorkLedgerEntry, 'sessionId'>,
  hasSession: (sessionId: string) => boolean,
): string | null {
  if (entry.sessionId === null) return 'no conversation for this seat'
  if (!hasSession(entry.sessionId)) return 'conversation not loaded'
  return null
}
