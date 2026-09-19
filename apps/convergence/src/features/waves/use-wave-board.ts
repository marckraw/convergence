import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useSessionCrewStore } from '@/entities/session-crew'
import {
  executionHostEndpointDisplayName,
  isLocalExecutionHost,
} from '@/entities/execution-host'
import { useAppSettingsStore } from '@/entities/app-settings'
import {
  useWorkLedgerStore,
  type WorkLedgerEntry,
} from '@/entities/work-ledger'
import { useFeedClock } from '@/shared/hooks/use-feed-clock'
import { loomHorses, type LoomHorse } from './loom-horses.pure'
import { loomSheets, type LoomSheets } from './loom-sheets.pure'
import { loadLoomCrew, saveLoomCrew } from './wave-panel-crew.api'
import { resolveLoomCrew, type LoomCrewOption } from './wave-panel-crew.pure'
import {
  resolveWaveRow,
  sectionWaveRows,
  waveBoardLine,
  waveHeader,
  waveRowsFromSnapshots,
  type WaveHeader,
  type WaveRowOpening,
  type WaveSections,
} from './wave-sections.pure'

/**
 * What Loom calls this machine.
 *
 * `This Mac`, the same words the crew's seat editor uses, rather than the
 * composer's `Local`: the two already disagreed before this slice, and a
 * panel about SEATS should read like the surface where seats are configured.
 */
export const LOOM_LOCAL_HOST_LABEL = 'This Mac'

/**
 * Which crews a board is built from (MAR-3225).
 *
 * - `all`: every bound crew -- Mission Control's Waves tab, the all-crews
 *   surface, where each row names its crew.
 * - `selected`: the one crew a person picked -- Loom, which is one crew's
 *   loom at a time. Two projects are two looms.
 */
export type WaveBoardScope = 'all' | 'selected'

export interface WaveBoard {
  /** How many crews read a tracker; zero means the column is not mounted. */
  boundCrewCount: number
  /** Every bound crew, in crew order: what Loom's crew picker lists. */
  crewOptions: LoomCrewOption[]
  /**
   * The crew the board is built from under `selected` (MAR-3225 R2): the
   * stored choice while it is bound, else the first bound crew; `null` under
   * `all`, or when nothing is bound.
   */
  selectedCrewId: string | null
  /** Picks the crew Loom shows and remembers it (MAR-3225 R4). */
  selectCrew: (crewId: string) => void
  sections: WaveSections
  /** The same rows in Loom's four sheets (MAR-3189 R2). */
  sheets: LoomSheets
  /** The shown crews' horse seats, in crew order (MAR-3191 R1). */
  horses: LoomHorse[]
  /** One loaded conversation by id, for a card's own door (MAR-3191 R6). */
  findSession: (sessionId: string) => SessionSummary | null
  /** When a crew's tracker last answered, for the detail's footer (MAR-3195). */
  lastOkAtOf: (crewId: string) => string | null
  /** The board's own clock, so an age is computed once per tick (R8). */
  now: number
  header: WaveHeader
  boardLine: string
  resolveRow: (entry: WorkLedgerEntry) => WaveRowOpening<SessionSummary>
}

/**
 * The one model behind the wave column, its rail and Mission Control's Waves
 * tab (MAR-3097 R4, R6): the bound crews' last snapshots, sectioned once.
 *
 * Owns the subscriptions and the `now` clock (R8), so every presentational
 * that draws a wave row is handed facts and never reaches a store.
 *
 * One hook for both surfaces, told which crews to show (MAR-3225): Loom asks
 * for the `selected` crew, the Waves tab for `all`. A parameter rather than a
 * second hook, so the two cannot drift into reading the ledger differently.
 */
export function useWaveBoard(scope: WaveBoardScope): WaveBoard {
  const crews = useSessionCrewStore((state) => state.crews)
  const loadCrews = useSessionCrewStore((state) => state.load)
  const snapshots = useWorkLedgerStore((state) => state.snapshots)
  const loadLedger = useWorkLedgerStore((state) => state.load)
  const sessions = useSessionStore((state) => state.globalSessions)
  const endpoints = useAppSettingsStore(
    (state) => state.settings.executionHostEndpoints,
  )
  const [now, setNow] = useState(() => Date.now())
  // Read under both scopes (hooks are not optional) and used only under
  // `selected`: the Waves tab has no choice to remember.
  const [storedCrew, setStoredCrew] = useState<string | null>(loadLoomCrew)

  useEffect(() => {
    void loadCrews()
  }, [loadCrews])

  // Keyed by the ids, not the array: a roster broadcast rebuilds the crews
  // array without changing which of them are bound.
  const boundKey = crews
    .filter((crew) => crew.trackerBinding)
    .map((crew) => crew.id)
    .join('\n')
  const boundCrewIds = useMemo(
    () => (boundKey ? boundKey.split('\n') : []),
    [boundKey],
  )
  // The crew's name, and no cap (MAR-3085 lap 2, E): `roundCap` is a HOP
  // budget for one crew's flow run, while a lap is per issue across runs.
  // Showing it as `lap 3 of 12` would put a bound on screen that the machine
  // does not enforce in that unit. A true lap cap rides MAR-3149.
  const crewFacts = useMemo(
    () => new Map(crews.map((crew) => [crew.id, { name: crew.name }])),
    [crews],
  )

  // Every bound crew's ledger is read, whichever is on screen: switching is
  // then a re-derivation of rows already here, not a read the person waits on.
  useEffect(() => {
    if (boundCrewIds.length > 0) void loadLedger(boundCrewIds)
  }, [boundCrewIds, loadLedger])

  const crewOptions = useMemo(
    () =>
      boundCrewIds.map((id) => ({ id, name: crewFacts.get(id)?.name ?? id })),
    [boundCrewIds, crewFacts],
  )
  const selectedCrewId =
    scope === 'selected' ? resolveLoomCrew(storedCrew, boundCrewIds) : null
  // The crews this board is BUILT from (MAR-3225 R1). Everything below --
  // rows, header health, horses -- reads this list and never `boundCrewIds`,
  // so a second crew cannot leak into Loom through any one of them.
  const shownCrewIds = useMemo(
    () =>
      scope === 'all'
        ? boundCrewIds
        : selectedCrewId === null
          ? []
          : [selectedCrewId],
    [scope, boundCrewIds, selectedCrewId],
  )
  const selectCrew = useCallback((crewId: string) => {
    setStoredCrew(crewId)
    saveLoomCrew(crewId)
  }, [])

  const rows = useMemo(
    () => waveRowsFromSnapshots(snapshots, shownCrewIds),
    [snapshots, shownCrewIds],
  )
  const headerCrews = useMemo(
    () =>
      shownCrewIds.map((id) => ({
        name: crewFacts.get(id)?.name ?? id,
        health: snapshots[id]?.trackerHealth ?? null,
      })),
    [snapshots, shownCrewIds, crewFacts],
  )

  // A row names its crew only where rows of several crews sit side by side
  // (MAR-3225 R5): the Waves tab. In Loom one crew is on screen and the
  // subline already names it.
  const several = shownCrewIds.length > 1
  const sections = useMemo(
    () =>
      sectionWaveRows(rows, now, (crewId) => ({
        name: several ? (crewFacts.get(crewId)?.name ?? crewId) : null,
        cap: null,
      })),
    [rows, now, several, crewFacts],
  )
  const sheets = useMemo(
    () =>
      loomSheets(rows, now, (crewId) => ({
        name: several ? (crewFacts.get(crewId)?.name ?? crewId) : null,
        cap: null,
      })),
    [rows, now, several, crewFacts],
  )
  const header = useMemo(
    () => waveHeader({ crews: headerCrews, rowCount: rows.length, now }),
    [headerCrews, rows.length, now],
  )

  // The clock exists for the ages on screen -- a row's "host unreachable
  // since 4m" and an outage header's "· 10m" (MAR-3148 R3). Nothing else
  // counts: "reading the tracker…" is a sentence without a number in it
  // (lap 2, D), and a bound crew whose tracker answered with nothing to show
  // carries no age at all. Waking React once a minute to recompute either is
  // the cost this gate exists to refuse.
  useFeedClock(rows.length > 0 || header.kind === 'outage', setNow)

  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  )
  const resolveRow = useCallback(
    (entry: WorkLedgerEntry) =>
      resolveWaveRow(entry, (id) => sessionsById.get(id) ?? null),
    [sessionsById],
  )
  const findSession = useCallback(
    (sessionId: string) => sessionsById.get(sessionId) ?? null,
    [sessionsById],
  )
  const lastOkAtOf = useCallback(
    (crewId: string) => snapshots[crewId]?.trackerHealth?.lastOkAt ?? null,
    [snapshots],
  )

  /**
   * A host id in the words the rest of the app uses (MAR-3191).
   *
   * The same source every other surface reads -- the saved endpoints in app
   * settings, named by the execution-host entity's own helper -- so Loom
   * cannot come to call a host something no other screen calls it. No new
   * IPC: the labels are already in the renderer.
   */
  const hostLabelOf = useCallback(
    (hostId: string | null) => {
      if (isLocalExecutionHost(hostId)) return LOOM_LOCAL_HOST_LABEL
      const endpoint = endpoints.find((candidate) => candidate.id === hostId)
      // The id itself when nothing names it: data a person can act on beats
      // a confident word the app does not have.
      return endpoint ? executionHostEndpointDisplayName(endpoint) : hostId
    },
    [endpoints],
  )
  const shownCrews = useMemo(
    () => crews.filter((crew) => shownCrewIds.includes(crew.id)),
    [crews, shownCrewIds],
  )
  const horses = useMemo(
    () => loomHorses({ crews: shownCrews, sessionsById, sheets, hostLabelOf }),
    [shownCrews, sessionsById, sheets, hostLabelOf],
  )

  return {
    boundCrewCount: boundCrewIds.length,
    crewOptions,
    selectedCrewId,
    selectCrew,
    sections,
    sheets,
    horses,
    findSession,
    lastOkAtOf,
    now,
    header,
    boardLine: waveBoardLine(sections),
    resolveRow,
  }
}
