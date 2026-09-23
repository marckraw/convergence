import type { DispatchPlan } from '@/shared/types/tracker.types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSessionStore, type SessionSummary } from '@/entities/session'
import { useSessionCrewStore } from '@/entities/session-crew'
import {
  executionHostEndpointDisplayName,
  isLocalExecutionHost,
} from '@/entities/execution-host'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useAppSurfaceStore } from '@/entities/app-surface'
import {
  useWorkLedgerStore,
  type WorkLedgerEntry,
} from '@/entities/work-ledger'
import { useFeedClock } from '@/shared/hooks/use-feed-clock'
import { loomHorses, type LoomHorse } from './loom-horses.pure'
import {
  waveBoardSessionIds,
  waveBoardSessionKey,
  waveBoardSessionsFromKey,
} from './wave-board-sessions.pure'
import { loomSheets, type LoomSheets } from './loom-sheets.pure'
import { loomSearchHorses, loomSearchRows } from './loom-search.pure'
import {
  loadLoomCrew,
  loadLoomFollow,
  saveLoomCrew,
  saveLoomFollow,
} from './wave-panel-crew.api'
import { loomCrewForConversation, openConversationId } from './loom-follow.pure'
import { resolveLoomCrew, type LoomCrewOption } from './wave-panel-crew.pure'
import {
  resolveWaveRow,
  waveHeader,
  waveRowsFromSnapshots,
  type WaveHeader,
  type WaveRowOpening,
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
 * One crew at a time -- Loom is one crew's loom at a time. Two projects are
 * two looms. (An `all` scope existed for Mission Control's Waves tab until
 * MAR-3233 retired it.)
 */
export interface WaveBoard {
  mergeSeat: { crewId: string; sessionId: string } | null
  dispatchPlan: DispatchPlan | null
  /** How many crews read a tracker; zero means the column is not mounted. */
  boundCrewCount: number
  /** Every bound crew, in crew order: what Loom's crew picker lists. */
  crewOptions: LoomCrewOption[]
  /**
   * The crew the board is built from (MAR-3225 R2): the stored choice while
   * it is bound, else the first bound crew; `null` when nothing is bound.
   */
  selectedCrewId: string | null
  /** Picks the crew Loom shows and remembers it (MAR-3225 R4). */
  selectCrew: (crewId: string) => void
  /** Whether Loom follows the open conversation (MAR-3291 R3). */
  followsConversation: boolean
  /** Turns following on or off, and remembers it (MAR-3291 R3). */
  setFollowsConversation: (on: boolean) => void
  /**
   * The same rows in Loom's four sheets (MAR-3189 R2) -- the rows that match
   * the search while there is one (MAR-3234 R2), so every title and every
   * number of the strip follows the one filter.
   */
  sheets: LoomSheets
  /**
   * The sheets with no search applied (MAR-3234): the same object as
   * `sheets` when nothing is searched. For what must not blink while a
   * person types -- an open detail is still the issue they are reading.
   */
  allSheets: LoomSheets
  /**
   * The shown crew's horse seats, in crew order (MAR-3191 R1), derived from
   * the UNFILTERED sheets (MAR-3234 R4): a horse whose issue does not match
   * is still working on it, and Next's queues and a detail's seat read that.
   */
  horses: LoomHorse[]
  /**
   * The horse cards a search shows (MAR-3234 R4): a card iff the issue it
   * holds matches; every horse when nothing is searched.
   */
  shownHorses: readonly LoomHorse[]
  /** One loaded conversation by id, for a card's own door (MAR-3191 R6). */
  findSession: (sessionId: string) => SessionSummary | null
  /** When a crew's tracker last answered, for the detail's footer (MAR-3195). */
  lastOkAtOf: (crewId: string) => string | null
  /** The board's own clock, so an age is computed once per tick (R8). */
  now: number
  header: WaveHeader
  resolveRow: (entry: WorkLedgerEntry) => WaveRowOpening<SessionSummary>
}

/**
 * The one model behind Loom (MAR-3097 R4, MAR-3189): the bound crews' last
 * snapshots, sectioned once.
 *
 * Owns the subscriptions and the `now` clock (R8), so every presentational
 * that draws a wave row is handed facts and never reaches a store.
 *
 * One hook for the whole board, one crew at a time (MAR-3225): everything
 * below is built from the shown crew's rows alone, so a second crew cannot
 * leak into Loom through any one of them.
 */
export function useWaveBoard(query: string | null): WaveBoard {
  const crews = useSessionCrewStore((state) => state.crews)
  const loadCrews = useSessionCrewStore((state) => state.load)
  const snapshots = useWorkLedgerStore((state) => state.snapshots)
  const loadLedger = useWorkLedgerStore((state) => state.load)
  const endpoints = useAppSettingsStore(
    (state) => state.settings.executionHostEndpoints,
  )
  const [now, setNow] = useState(() => Date.now())
  // The crew Loom is on screen for (MAR-3225 R2): the stored choice while it
  // is bound, else the first bound crew.
  const [storedCrew, setStoredCrew] = useState<string | null>(loadLoomCrew)
  // Follow the open conversation (MAR-3291 R3), off until somebody asks.
  const [followsConversation, setFollows] = useState<boolean>(loadLoomFollow)
  const surface = useAppSurfaceStore((state) => state.activeSurface)
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const activeGlobalSessionId = useSessionStore(
    (state) => state.activeGlobalSessionId,
  )

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
  // The crew's name and its lap cap (MAR-3149): `roundCap` is a HOP budget
  // for one crew's flow run, while a lap is per issue across runs. The board
  // passes `lapCap` into `crewFacts.cap` so the row can say `lap N of C`.
  const crewFacts = useMemo(
    () =>
      new Map(
        crews.map((crew) => [crew.id, { name: crew.name, cap: crew.lapCap }]),
      ),
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
  const selectedCrewId = resolveLoomCrew(storedCrew, boundCrewIds)
  // The crews this board is BUILT from (MAR-3225 R1). Everything below --
  // rows, header health, horses -- reads this list and never `boundCrewIds`,
  // so a second crew cannot leak into Loom through any one of them.
  const shownCrewIds = useMemo(
    () => (selectedCrewId === null ? [] : [selectedCrewId]),
    [selectedCrewId],
  )
  const selectCrew = useCallback((crewId: string) => {
    setStoredCrew(crewId)
    saveLoomCrew(crewId)
  }, [])
  const setFollowsConversation = useCallback((on: boolean) => {
    setFollows(on)
    saveLoomFollow(on)
  }, [])

  // Which conversation is being read right now (MAR-3291 R2).
  const openConversation = openConversationId({
    surface,
    activeSessionId,
    activeGlobalSessionId,
  })
  /**
   * The conversation this board has already followed FROM.
   *
   * Following is an EVENT -- the open conversation changed -- and not a state
   * the crew is derived from (R2). Derived, a pick from the crew picker would
   * be undone by the next render, which is every broadcast: the control would
   * be a control that does not hold. A ref is what makes the difference
   * visible to the effect, which re-runs on every roster reload and ledger
   * broadcast in its dependencies and must do nothing on all of them.
   *
   * Cleared while following is off, so switching it ON follows at once for
   * the conversation that is open then (R3).
   */
  const followedFrom = useRef<string | null>(null)
  useEffect(() => {
    if (!followsConversation) {
      followedFrom.current = null
      return
    }
    if (followedFrom.current === openConversation) return
    // Consumed whatever the answer is: a conversation with no Loom of its own
    // leaves Loom where it was, and does not leave the change pending for the
    // next broadcast to act on.
    followedFrom.current = openConversation
    const sessions = useSessionStore.getState().globalSessions
    const next = loomCrewForConversation({
      session: sessions.find((entry) => entry.id === openConversation) ?? null,
      crews: crews.map((crew) => ({
        id: crew.id,
        bound: crew.trackerBinding !== null,
        members: crew.members,
      })),
      sessions,
      current: selectedCrewId,
    })
    if (next !== null && next !== selectedCrewId) selectCrew(next)
  }, [followsConversation, openConversation, crews, selectedCrewId, selectCrew])

  const rows = useMemo(
    () => waveRowsFromSnapshots(snapshots, shownCrewIds),
    [snapshots, shownCrewIds],
  )
  const crewOf = useCallback(
    (crewId: string) => ({
      // Loom is one crew at a time (MAR-3225 R5): the row does not repeat the
      // crew name. The lap cap is the fact this board was waiting for
      // (MAR-3149).
      name: null as string | null,
      cap: crewFacts.get(crewId)?.cap ?? null,
    }),
    [crewFacts],
  )
  const headerCrews = useMemo(
    () =>
      shownCrewIds.map((id) => ({
        name: crewFacts.get(id)?.name ?? id,
        health: snapshots[id]?.trackerHealth ?? null,
      })),
    [snapshots, shownCrewIds, crewFacts],
  )

  const allSheets = useMemo(
    () => loomSheets(rows, now, crewOf),
    [rows, now, crewOf],
  )
  // The search (MAR-3234 R2, R10): one filter over the rows, run once per
  // settled query -- never per keystroke, and never at all with no query, so
  // an unsearched Loom is today's Loom by identity.
  const searchedRows = useMemo(
    () => (query === null ? null : loomSearchRows(rows, query)),
    [rows, query],
  )
  const sheets = useMemo(
    () =>
      searchedRows === null ? allSheets : loomSheets(searchedRows, now, crewOf),
    [allSheets, searchedRows, now, crewOf],
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

  const shownCrews = useMemo(
    () => crews.filter((crew) => shownCrewIds.includes(crew.id)),
    [crews, shownCrewIds],
  )
  const sessionIds = useMemo(
    () => waveBoardSessionIds(shownCrews, rows),
    [shownCrews, rows],
  )
  const sessionKey = useSessionStore(
    useCallback(
      (state) => waveBoardSessionKey(state.globalSessions, sessionIds),
      [sessionIds],
    ),
  )
  const sessionsById = useMemo(
    () => waveBoardSessionsFromKey(sessionKey),
    [sessionKey],
  )
  const findSession = useCallback(
    (sessionId: string) =>
      useSessionStore
        .getState()
        .globalSessions.find((session) => session.id === sessionId) ?? null,
    [],
  )
  const resolveRow = useCallback(
    (entry: WorkLedgerEntry) =>
      // Presence is a subscribed fact. The detail only carries the summary
      // to its Open action; its displayed words come from the row/horse.
      resolveWaveRow(entry, (id) =>
        sessionsById.has(id) ? findSession(id) : null,
      ),
    [sessionsById, findSession],
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
  // From the UNFILTERED sheets (MAR-3234 R4): "held" stays true of a horse
  // whose issue the search does not match; only the cards are filtered.
  const horses = useMemo(
    () =>
      loomHorses({
        crews: shownCrews,
        sessionsById,
        sheets: allSheets,
        hostLabelOf,
      }),
    [shownCrews, sessionsById, allSheets, hostLabelOf],
  )
  const shownHorses = useMemo(
    () => loomSearchHorses(horses, query),
    [horses, query],
  )

  const mergeMember = shownCrews[0]?.members.find(
    (member) =>
      member.sessionId === openConversation && member.role === 'mastermind',
  )
  return {
    mergeSeat:
      mergeMember?.sessionId && selectedCrewId
        ? { crewId: selectedCrewId, sessionId: mergeMember.sessionId }
        : null,
    dispatchPlan: selectedCrewId
      ? (snapshots[selectedCrewId]?.dispatchPlan ?? null)
      : null,
    boundCrewCount: boundCrewIds.length,
    crewOptions,
    selectedCrewId,
    selectCrew,
    followsConversation,
    setFollowsConversation,
    sheets,
    allSheets,
    horses,
    shownHorses,
    findSession,
    lastOkAtOf,
    now,
    header,
    resolveRow,
  }
}
