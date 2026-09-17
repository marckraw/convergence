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
  const crewNames = useMemo(
    () => new Map(crews.map((crew) => [crew.id, crew.name])),
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
        name: crewNames.get(id) ?? id,
        health: snapshots[id]?.trackerHealth ?? null,
      })),
    [snapshots, boundCrewIds, crewNames],
  )

  // Ages ("since 4m") are statements about now; tick while anything on
  // screen could carry one.
  useFeedClock(boundCrewIds.length > 0, setNow)

  const several = boundCrewIds.length > 1
  const sections = useMemo(
    () =>
      sectionWaveRows(rows, now, (crewId) =>
        several ? (crewNames.get(crewId) ?? crewId) : null,
      ),
    [rows, now, several, crewNames],
  )
  const header = useMemo(
    () => waveHeader({ crews: headerCrews, rowCount: rows.length, now }),
    [headerCrews, rows.length, now],
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
