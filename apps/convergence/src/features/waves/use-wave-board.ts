import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useSessionCrewStore } from '@/entities/session-crew'
import {
  useWorkLedgerStore,
  type WorkLedgerEntry,
} from '@/entities/work-ledger'
import { useFeedClock } from '@/shared/hooks/use-feed-clock'
import {
  sectionWaveRows,
  waveHeader,
  waveRowInertReason,
  waveRowsFromSnapshots,
  type WaveHeader,
  type WaveSections,
} from './wave-sections.pure'

export interface WaveBoard {
  sections: WaveSections
  header: WaveHeader
  inertReason: (entry: WorkLedgerEntry) => string | null
  resolveSession: (entry: WorkLedgerEntry) => SessionSummary | null
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

  useEffect(() => {
    if (boundCrewIds.length > 0) void loadLedger(boundCrewIds)
  }, [boundCrewIds, loadLedger])

  const rows = useMemo(
    () => waveRowsFromSnapshots(snapshots, boundCrewIds),
    [snapshots, boundCrewIds],
  )
  const healths = useMemo(
    () => boundCrewIds.map((id) => snapshots[id]?.trackerHealth ?? null),
    [snapshots, boundCrewIds],
  )

  // Ages ("since 4m") are statements about now; tick while there is anything
  // on screen that carries one.
  useFeedClock(
    rows.length > 0 || healths.some((h) => h && h.state !== 'ok'),
    setNow,
  )

  const sections = useMemo(() => sectionWaveRows(rows, now), [rows, now])
  const header = useMemo(
    () =>
      waveHeader({
        boundCrewCount: boundCrewIds.length,
        healths,
        rowCount: rows.length,
        now,
      }),
    [boundCrewIds.length, healths, rows.length, now],
  )

  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  )
  const inertReason = useCallback(
    (entry: WorkLedgerEntry) =>
      waveRowInertReason(entry, (id) => sessionsById.has(id)),
    [sessionsById],
  )
  const resolveSession = useCallback(
    (entry: WorkLedgerEntry) =>
      entry.sessionId === null
        ? null
        : (sessionsById.get(entry.sessionId) ?? null),
    [sessionsById],
  )

  return { sections, header, inertReason, resolveSession }
}
