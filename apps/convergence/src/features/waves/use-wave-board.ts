import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useSessionCrewStore } from '@/entities/session-crew'
import {
  useWorkLedgerStore,
  type WorkLedgerEntry,
} from '@/entities/work-ledger'
import { useFeedClock } from '@/shared/hooks/use-feed-clock'
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

export interface WaveBoard {
  /** How many crews read a tracker; zero means the column is not mounted. */
  boundCrewCount: number
  sections: WaveSections
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
 */
export function useWaveBoard(): WaveBoard {
  const crews = useSessionCrewStore((state) => state.crews)
  const loadCrews = useSessionCrewStore((state) => state.load)
  const snapshots = useWorkLedgerStore((state) => state.snapshots)
  const loadLedger = useWorkLedgerStore((state) => state.load)
  const sessions = useSessionStore((state) => state.globalSessions)
  const [now, setNow] = useState(() => Date.now())

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

  useEffect(() => {
    if (boundCrewIds.length > 0) void loadLedger(boundCrewIds)
  }, [boundCrewIds, loadLedger])

  const rows = useMemo(
    () => waveRowsFromSnapshots(snapshots, boundCrewIds),
    [snapshots, boundCrewIds],
  )
  const headerCrews = useMemo(
    () =>
      boundCrewIds.map((id) => ({
        name: crewFacts.get(id)?.name ?? id,
        health: snapshots[id]?.trackerHealth ?? null,
      })),
    [snapshots, boundCrewIds, crewFacts],
  )

  const several = boundCrewIds.length > 1
  const sections = useMemo(
    () =>
      sectionWaveRows(rows, now, (crewId) => ({
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
  // since 4m", an outage header's "· 10m", the "reading the tracker…" wait
  // (MAR-3148 R3). A bound crew whose tracker answered with nothing to show
  // carries no age at all, and waking React once a minute to recompute an
  // empty board is the cost this gate exists to refuse.
  useFeedClock(
    rows.length > 0 || header.kind === 'outage' || header.kind === 'reading',
    setNow,
  )

  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  )
  const resolveRow = useCallback(
    (entry: WorkLedgerEntry) =>
      resolveWaveRow(entry, (id) => sessionsById.get(id) ?? null),
    [sessionsById],
  )

  return {
    boundCrewCount: boundCrewIds.length,
    sections,
    header,
    boardLine: waveBoardLine(sections),
    resolveRow,
  }
}
