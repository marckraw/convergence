import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import { Waypoints } from 'lucide-react'
import { useCrewHailStore } from '@/entities/crew-hail'
import { runHistoryApi } from '@/entities/run-history'
import type { RelayRunPage } from '@/entities/run-history'
import { useProjectStore } from '@/entities/project'
import {
  providerAccountApi,
  providerAccountsForProvider,
  resolveInitialProviderAccountSelection,
} from '@/entities/provider-account'
import type { ProviderAccount } from '@/entities/provider-account'
import { selectLocalProviders, useSessionStore } from '@/entities/session'
import { sessionCrewApi, useSessionCrewStore } from '@/entities/session-crew'
import {
  selectRelaysForCrew,
  sessionRelayApi,
  useSessionRelayStore,
} from '@/entities/session-relay'
import type { SessionRelay } from '@/entities/session-relay'
import {
  AddConversationsPanel,
  ANY_PROJECT_OPTION_ID,
  CONNECT_MODE_OFF,
  CanvasToolbar,
  ConnectionInspector,
  CrewSettingsPanel,
  DEFAULT_CREW_ROUND_CAP,
  DEFAULT_CREW_STALL_MINUTES,
  GLOBAL_PROJECT_OPTION_ID,
  SPAWN_RECIPIENT_OPTION_ID,
  batonNameRefusal,
  appendRunPage,
  beforeDeliveryOptions,
  changeDraftRecipient,
  HistoryEventInspector,
  HistoryPanel,
  RUN_LAP_DELIVERY_GLOSSARY,
  buildRunEvents,
  buildRunHighlight,
  buildRunRow,
  buildHailEventRow,
  cancelConnectMode,
  connectModeHint,
  filterRuns,
  formatRunSummary,
  formatRunTime,
  historyOutcomeWord,
  historyPanelState,
  connectionDraftIsDirty,
  connectionDraftProblem,
  customOpenerNote,
  draftFromRelay,
  EMPTY_SPAWN_SPEC,
  newConnectionDraft,
  pickConnectCard,
  relayInputFromDraft,
  toggleConnectMode,
} from '@/features/mission-control'
import type {
  BeforeDeliveryMode,
  ConnectModeState,
  ConnectionDraft,
  ConnectionSpawnSpec,
  HistoryEventRow,
  HistoryFilter,
  SessionCard,
  SessionCrewGroup,
} from '@/features/mission-control'
import { Button } from '@/shared/ui/button'
import { SessionCanvas } from './session-canvas.container'
import type { SessionCanvasAuthoring } from './session-canvas.container'

/** Which of the four right-hand panels is open, and what it is about. */
type PanelState =
  | { kind: 'none' }
  | { kind: 'crew-settings' }
  | { kind: 'add-conversations' }
  /** A connection: a stored one being edited, or a draft nobody has saved. */
  | { kind: 'connection'; relayId: string | null }
  /** One recorded event, opened from history. */
  | { kind: 'history-event'; eventId: string }

interface CrewCanvasProps {
  groups: readonly SessionCrewGroup[]
  onOpen: (card: SessionCard) => void
}

/**
 * The Canvas as a workspace (R10, R13).
 *
 * It holds the toolbar, the diagram and the one right-hand panel, and it owns
 * every piece of state that spans them: which crew the toolbar is about, the
 * Connect-mode pick in progress, and the connection draft being edited.
 *
 * **The crew the toolbar acts on is the SELECTED one**, and the canvas still
 * draws every crew the filter left. The design's frames show one crew because
 * they show one crew's work; the room genuinely holds several, and hiding the
 * rest to match a frame would have been a navigation decision nobody ruled on.
 * Selecting is clicking anything in a crew, and a room with one crew looks
 * exactly like the frames.
 *
 * Nothing here sends a message. Drawing opens a draft, saving stores a row,
 * the switch stores a switch, adding a conversation stores a membership. The
 * engine is the only thing that ever delivers.
 */
export const CrewCanvas: FC<CrewCanvasProps> = ({ groups, onOpen }) => {
  const crewGroups = useMemo(
    () => groups.filter((group) => group.crew !== null),
    [groups],
  )

  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null)
  // Raw on purpose, and used in exactly three places: `applyPanel`,
  // `closePanel`, and the beat after a successful save. Every other panel
  // change goes through `leaveDraft` below, which is what keeps the discard
  // guard from being a rule each new gesture has to remember.
  const [panel, setPanelState] = useState<PanelState>({ kind: 'none' })
  const [connectMode, setConnectMode] =
    useState<ConnectModeState>(CONNECT_MODE_OFF)
  const [draft, setDraft] = useState<ConnectionDraft | null>(null)
  const [savedDraft, setSavedDraft] = useState<ConnectionDraft | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /**
   * What leaving the draft would do, held until the person answers.
   *
   * A thunk rather than a panel, because the four ways out do different
   * things: two of them replace the draft with another one, one changes which
   * run is selected, and one just closes. Storing the ACTION lets all of them
   * share one guard instead of one guard per shape.
   */
  const [confirmDiscard, setConfirmDiscard] = useState<{
    run: () => void
  } | null>(null)
  /** What a recipient change silently dropped, said out loud (M2). */
  const [recipientNote, setRecipientNote] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<ProviderAccount[]>([])
  const [addQuery, setAddQuery] = useState('')
  const [addProjectId, setAddProjectId] = useState<string | null>(null)
  const [addSelection, setAddSelection] = useState<string[]>([])
  const [batonNameDrafts, setBatonNameDrafts] = useState<
    Record<string, string>
  >({})
  const [batonNameProblem, setBatonNameProblem] = useState<{
    sessionId: string
    message: string
  } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState<RelayRunPage | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyLoadingOlder, setHistoryLoadingOlder] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [olderError, setOlderError] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const allRelays = useSessionRelayStore((state) => state.relays)
  const createRelay = useSessionRelayStore((state) => state.createRelay)
  const updateRelay = useSessionRelayStore((state) => state.updateRelay)
  const deleteRelay = useSessionRelayStore((state) => state.deleteRelay)
  const relayError = useSessionRelayStore((state) => state.error)
  const clearRelayError = useSessionRelayStore((state) => state.clearError)
  const loadCrews = useSessionCrewStore((state) => state.load)
  const allHails = useCrewHailStore((state) => state.hails)
  // The existing acknowledgement, unchanged: history did not invent a second
  // way to answer a call, it moved where the button lives.
  const acknowledgeHail = useCrewHailStore((state) => state.acknowledge)
  const sessions = useSessionStore((state) => state.globalSessions)
  const providers = useSessionStore(selectLocalProviders)
  const projects = useProjectStore((state) => state.projects)

  // Read once for the surface rather than per connection: the list is small,
  // changes rarely, and every spawn form asks the same question of it.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const loaded = await providerAccountApi.list()
        if (!cancelled) setAccounts(loaded)
      } catch {
        // A room that cannot read accounts still draws its wires; the engine
        // falls back to ambient exactly as it did before accounts existed.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedGroup = useMemo(
    () =>
      crewGroups.find(
        (group) => group.crew?.id === selectedCrewId && group.cards.length > 0,
      ) ??
      crewGroups.find((group) => group.cards.length > 0) ??
      null,
    [crewGroups, selectedCrewId],
  )
  const crew = selectedGroup?.crew ?? null

  const relays = useMemo(
    () => (crew ? selectRelaysForCrew({ relays: allRelays }, crew.id) : []),
    [allRelays, crew],
  )

  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  )

  // Names come from the WHOLE session list rather than the filtered room: a
  // connection keeps pointing at a conversation the room is currently hiding,
  // and calling that "gone" would be a lie about why it cannot be shown.
  const resolveName = useCallback(
    (sessionId: string) => sessionsById.get(sessionId)?.name ?? null,
    [sessionsById],
  )

  const providersById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  )

  const recipientProvider = useMemo(() => {
    if (!draft || draft.recipient.kind !== 'session') return null
    const sessionId = draft.recipient.sessionId
    if (!sessionId) return null
    const providerId = sessionsById.get(sessionId)?.providerId
    return providerId ? (providersById.get(providerId) ?? null) : null
  }, [draft, sessionsById, providersById])

  const supportsReset = recipientProvider?.supportsConversationReset ?? false

  const closePanel = useCallback(() => {
    setPanelState({ kind: 'none' })
    setDraft(null)
    setSavedDraft(null)
    setSaveError(null)
    setRecipientNote(null)
    clearRelayError()
  }, [clearRelayError])

  /**
   * Leaving an unfinished draft asks first (frame 10-02).
   *
   * ONE door rather than a rule each gesture remembers (M3). The guard used
   * to sit on the toolbar and Cancel, so the gestures that also lose a draft
   * -- clicking a stored wire, drawing a second pair, opening a recorded
   * event, picking a run -- threw it away in silence. Anything that would
   * replace the draft or take the panel off it goes through here, and the
   * thing it would do is the argument.
   *
   * Only when there is something to lose: a panel opened and closed without a
   * change closes silently, because a confirmation nobody needed is a
   * confirmation people learn to dismiss without reading.
   */
  const leaveDraft = useCallback(
    (run: () => void) => {
      const dirty =
        draft !== null &&
        (savedDraft === null || connectionDraftIsDirty(draft, savedDraft))
      if (dirty) {
        setConfirmDiscard({ run })
        return false
      }
      run()
      return true
    },
    [draft, savedDraft],
  )

  /** Moves to another panel, dropping whatever draft the last one held. */
  const applyPanel = useCallback(
    (next: PanelState) => {
      if (next.kind === 'none') {
        closePanel()
        return
      }
      setDraft(null)
      setSavedDraft(null)
      setSaveError(null)
      setRecipientNote(null)
      setPanelState(next)
    },
    [closePanel],
  )

  const leavePanel = useCallback(
    (next: PanelState) => leaveDraft(() => applyPanel(next)),
    [leaveDraft, applyPanel],
  )

  const openConnection = useCallback(
    (relay: SessionRelay) => {
      leaveDraft(() => {
        const target = relay.action === 'hail' ? relay.targetSessionId : null
        const provider = target
          ? providersById.get(sessionsById.get(target)?.providerId ?? '')
          : undefined
        const next = draftFromRelay(relay, {
          supportsReset: provider?.supportsConversationReset ?? false,
        })
        setDraft(next)
        setSavedDraft(next)
        setSaveError(null)
        setRecipientNote(null)
        clearRelayError()
        setPanelState({ kind: 'connection', relayId: relay.id })
      })
    },
    [leaveDraft, providersById, sessionsById, clearRelayError],
  )

  /**
   * A pair was drawn — by drag, by click, or by keyboard. All three land here.
   *
   * It opens a DRAFT and writes nothing. A drawn connection that saved itself
   * would make a slipped drag a stored, armed wire, and an armed wire is one
   * settle away from spending somebody's provider quota.
   */
  const openDraft = useCallback(
    (
      input: { sourceSessionId: string; targetSessionId: string },
      nextConnectMode?: ConnectModeState,
    ) => {
      leaveDraft(() => {
        if (nextConnectMode) setConnectMode(nextConnectMode)
        const batonName =
          crew?.members.find(
            (member) => member.sessionId === input.targetSessionId,
          )?.batonName ?? null
        const next = newConnectionDraft({
          sourceSessionId: input.sourceSessionId,
          targetSessionId: input.targetSessionId,
          suggestedBatonName: batonName,
        })
        setDraft(next)
        setSavedDraft(null)
        setSaveError(null)
        setRecipientNote(null)
        clearRelayError()
        setPanelState({ kind: 'connection', relayId: null })
      })
    },
    [leaveDraft, crew, clearRelayError],
  )

  const handlePick = useCallback(
    (sessionId: string) => {
      const result = pickConnectCard(connectMode, sessionId)
      if (result.drawn) openDraft(result.drawn, result.state)
      else setConnectMode(result.state)
    },
    [connectMode, openDraft],
  )

  // Esc backs out of a pick, then out of the mode. Bound on the window rather
  // than on a card, because the person may be looking anywhere by then.
  useEffect(() => {
    if (connectMode.kind === 'off') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setConnectMode((current) => cancelConnectMode(current))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [connectMode.kind])

  const save = useCallback(async () => {
    if (!draft || !crew || panel.kind !== 'connection') return
    const problem = connectionDraftProblem(draft, relays, panel.relayId, {
      supportsReset,
    })
    if (problem) return

    setBusy(true)
    clearRelayError()
    const input = { ...relayInputFromDraft(draft), crewId: crew.id }
    const saved =
      panel.relayId === null
        ? await createRelay(input)
        : await updateRelay(panel.relayId, input)
    setBusy(false)

    if (!saved) {
      // Frame 09: the draft stays exactly as typed and the STORED wire is
      // untouched. Throwing the form away here is the defect this state
      // exists to prevent — the work is the expensive part, not the row.
      setSaveError(
        useSessionRelayStore.getState().error ??
          'Convergence could not store this connection.',
      )
      return
    }

    setSaveError(null)
    const next = draftFromRelay(saved, { supportsReset })
    setDraft(next)
    setSavedDraft(next)
    setRecipientNote(null)
    // Not through the guard: this IS the save, and the draft it would offer
    // to protect is the one that was just stored.
    setPanelState({ kind: 'connection', relayId: saved.id })
  }, [
    draft,
    crew,
    panel,
    relays,
    createRelay,
    updateRelay,
    clearRelayError,
    supportsReset,
  ])

  const remove = useCallback(async () => {
    if (panel.kind !== 'connection' || panel.relayId === null) return
    setBusy(true)
    await deleteRelay(panel.relayId)
    setBusy(false)
    closePanel()
  }, [panel, deleteRelay, closePanel])

  const moveCard = useCallback(
    (input: { sessionId: string; x: number; y: number }) => {
      if (!crew) return
      // Already crew-local: the canvas converts, because it is the only
      // place that knows where each frame starts.
      void sessionCrewApi
        .setMemberPosition(crew.id, input.sessionId, {
          x: input.x,
          y: input.y,
        })
        .then(() => loadCrews())
        .catch(() => {
          // A position that would not store is not worth an alarm: the card
          // returns to where the layout puts it on the next load, which is
          // visible and recoverable by dragging it again.
        })
    },
    [crew, loadCrews],
  )

  const setLoopLimit = useCallback(
    async (patch: {
      roundCap?: number | null
      stallMinutes?: number | null
    }) => {
      if (!crew) return
      setBusy(true)
      try {
        await sessionCrewApi.update(crew.id, patch)
        await loadCrews()
      } catch {
        // An unchanged crew is the honest fallback.
      }
      setBusy(false)
    },
    [crew, loadCrews],
  )

  const commitBatonName = useCallback(
    async (sessionId: string) => {
      if (!crew) return
      const typed = batonNameDrafts[sessionId]
      if (typed === undefined) return
      setBatonNameDrafts((drafts) => {
        const next = { ...drafts }
        delete next[sessionId]
        return next
      })
      setBusy(true)
      setBatonNameProblem(null)
      try {
        await sessionCrewApi.setMemberBatonName(
          crew.id,
          sessionId,
          typed.trim() ? typed : null,
        )
        await loadCrews()
      } catch (error) {
        // The roster stays as it was and the field reverts to the stored
        // name — now with the door's own reason under it. A swallowed refusal
        // shows as nothing but the typing vanishing.
        setBatonNameProblem({ sessionId, message: batonNameRefusal(error) })
      }
      setBusy(false)
    },
    [crew, batonNameDrafts, loadCrews],
  )

  const addConversations = useCallback(async () => {
    if (!crew || addSelection.length === 0) return
    setBusy(true)
    try {
      for (const sessionId of addSelection) {
        await sessionCrewApi.addMember(crew.id, sessionId)
      }
      await loadCrews()
      setAddSelection([])
      closePanel()
    } catch {
      // Membership that would not store leaves the panel open with the
      // selection intact, so the person can try again without re-picking.
    }
    setBusy(false)
  }, [crew, addSelection, loadCrews, closePanel])

  const removeMember = useCallback(
    async (sessionId: string) => {
      if (!crew) return
      setBusy(true)
      try {
        await sessionCrewApi.removeMember(crew.id, sessionId)
        await loadCrews()
      } catch {
        // Same as above.
      }
      setBusy(false)
    },
    [crew, loadCrews],
  )

  const projectOptions = useMemo(
    () => [
      { id: GLOBAL_PROJECT_OPTION_ID, label: 'no project (global)' },
      ...projects.map((project) => ({ id: project.id, label: project.name })),
    ],
    [projects],
  )

  const addProjectOptions = useMemo(
    () => [
      { id: ANY_PROJECT_OPTION_ID, label: 'All projects' },
      ...projects.map((project) => ({ id: project.id, label: project.name })),
    ],
    [projects],
  )

  const providerOptions = useMemo(
    () =>
      providers
        .filter((provider) => provider.kind === 'conversation')
        .map((provider) => ({
          id: provider.id,
          label: provider.name,
          description: provider.vendorLabel,
        })),
    [providers],
  )

  const spawnProviderId =
    draft?.recipient.kind === 'spawn' ? draft.recipient.spec.providerId : null
  const spawnModel =
    draft?.recipient.kind === 'spawn' ? draft.recipient.spec.model : null
  const selectedSpawnProvider = spawnProviderId
    ? providersById.get(spawnProviderId)
    : undefined

  const modelOptions = useMemo(
    () =>
      (selectedSpawnProvider?.modelOptions ?? []).map((model) => ({
        id: model.id,
        label: model.label,
      })),
    [selectedSpawnProvider],
  )

  const effortOptions = useMemo(
    () =>
      (
        selectedSpawnProvider?.modelOptions.find(
          (model) => model.id === spawnModel,
        )?.effortOptions ?? []
      ).map((effort) => ({ id: effort.id, label: effort.label })),
    [selectedSpawnProvider, spawnModel],
  )

  const spawnAccounts = useMemo(
    () => providerAccountsForProvider(accounts, spawnProviderId),
    [accounts, spawnProviderId],
  )

  const recipientOptions = useMemo(() => {
    if (!crew || !draft) return []
    return crew.sessionIds
      .filter((sessionId) => sessionId !== draft.sourceSessionId)
      .map((sessionId) => ({
        id: sessionId,
        label: resolveName(sessionId) ?? 'a conversation that is gone',
      }))
  }, [crew, draft, resolveName])

  const available = useMemo(() => {
    if (!crew) return []
    const inCrew = new Set(crew.sessionIds)
    const query = addQuery.trim().toLowerCase()
    return sessions
      .filter((session) => !inCrew.has(session.id))
      .filter((session) =>
        addProjectId ? session.projectId === addProjectId : true,
      )
      .filter((session) =>
        query ? session.name.toLowerCase().includes(query) : true,
      )
      .map((session) => ({
        sessionId: session.id,
        name: session.name,
        detail: [
          session.providerId,
          session.model,
          projects.find((project) => project.id === session.projectId)?.name ??
            (session.projectId ? 'Unknown project' : 'No project'),
        ]
          .filter(Boolean)
          .join(' · '),
      }))
  }, [crew, sessions, projects, addQuery, addProjectId])

  /**
   * Whether this crew has work in flight (R7).
   *
   * Read off the members' own statuses rather than from the engine's live-run
   * set, because the renderer has the first and not the second — and the
   * sentence this drives is informational by ruling. The panel SAYS the state
   * and enforces nothing: the engine reads a source's wires at settle time,
   * so an edit saved now applies from the next delivery and cannot rewrite a
   * hop already recorded.
   */
  const crewIsRunning = useMemo(
    () =>
      crew
        ? crew.sessionIds.some(
            (sessionId) => sessionsById.get(sessionId)?.status === 'running',
          )
        : false,
    [crew, sessionsById],
  )

  /**
   * Loads this crew's history.
   *
   * A READ, and only a read: nothing here retries a delivery, which is the
   * fear the panel's own sentence answers. The selected run survives a
   * reload, so "try again" after a load error does not also lose the place.
   */
  const historyCrewId = crew?.id
  const historyEpoch = useRef(0)
  const loadHistory = useCallback(
    async (preserve = false) => {
      if (!historyCrewId) return
      const epoch = ++historyEpoch.current
      setHistoryLoading(true)
      setHistoryLoadingOlder(false)
      setHistoryError(null)
      setOlderError(null)
      try {
        const page = await runHistoryApi.listRuns(historyCrewId)
        if (epoch !== historyEpoch.current) return
        setHistoryPage((current) =>
          preserve && current
            ? {
                ...appendRunPage(page, current),
                hasMore: page.hasMore,
                nextCursor: page.nextCursor,
              }
            : page,
        )
      } catch (error) {
        if (epoch !== historyEpoch.current) return
        if (!preserve) setHistoryPage(null)
        setHistoryError(
          error instanceof Error
            ? error.message
            : 'Convergence could not read this crew’s history.',
        )
      }
      setHistoryLoading(false)
    },
    [historyCrewId],
  )

  /**
   * The next page down, joined onto the one on screen (L2).
   *
   * The full cursor carries the first page's asOf and order key. A refresh
   * replaces it with a new snapshot, even while retained older rows remain
   * visible; dedupe absorbs those rows as the new snapshot is paged.
   */
  const loadOlderRuns = useCallback(async () => {
    const cursor = historyPage?.nextCursor
    if (!crew || !historyPage?.hasMore || !cursor) return
    const epoch = historyEpoch.current
    setHistoryLoadingOlder(true)
    setOlderError(null)
    try {
      const older = await runHistoryApi.listRuns(crew.id, {
        before: cursor,
      })
      if (epoch !== historyEpoch.current) return
      setHistoryPage((current) =>
        current ? appendRunPage(current, older) : older,
      )
    } catch (error) {
      if (epoch !== historyEpoch.current) return
      // The runs already read stay on screen: losing them because the page
      // below them would not load would be the button destroying the thing it
      // was meant to extend.
      setOlderError(
        error instanceof Error
          ? error.message
          : 'Convergence could not read this crew’s history.',
      )
    }
    setHistoryLoadingOlder(false)
  }, [crew, historyPage])

  useEffect(() => {
    if (!historyOpen) return
    void loadHistory()
    return () => {
      historyEpoch.current += 1
    }
  }, [historyOpen, loadHistory])

  useEffect(() => {
    if (!historyOpen || !historyCrewId) return
    const crewId = historyCrewId
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void loadHistory(true), 500)
    }
    const offHop = sessionRelayApi.onHopAppended((hop) => {
      if (hop.crewId === crewId) refresh()
    })
    const offHail = useCrewHailStore.subscribe((current, previous) => {
      const next = current.hails.filter((hail) => hail.crewId === crewId)
      const before = previous.hails.filter((hail) => hail.crewId === crewId)
      if (JSON.stringify(next) !== JSON.stringify(before)) refresh()
    })
    return () => {
      clearTimeout(timer)
      offHop()
      offHail()
    }
  }, [historyOpen, historyCrewId, loadHistory])

  const visibleRuns = useMemo(
    () => filterRuns(historyPage?.runs ?? [], historyFilter),
    [historyPage, historyFilter],
  )

  const selectedRun = useMemo(
    () =>
      visibleRuns.find((run) => run.flowRunId === selectedRunId) ??
      visibleRuns[0] ??
      null,
    [visibleRuns, selectedRunId],
  )

  // Memoized rather than defaulted inline: `?? {}` mints a fresh object every
  // render, which makes every memo that depends on it recompute — including
  // the run highlight the canvas re-styles its edges from.
  const historyOutcomes = useMemo(
    () => historyPage?.outcomes ?? {},
    [historyPage],
  )

  const runEvents = useMemo(
    () =>
      selectedRun
        ? buildRunEvents(selectedRun, {
            resolveName,
            outcomes: historyOutcomes,
          })
        : { laps: [], calls: [] },
    [selectedRun, resolveName, historyOutcomes],
  )

  const unattributedCalls = useMemo(
    () =>
      (historyPage?.unattributedHails ?? []).map((hail) =>
        buildHailEventRow(hail, { resolveName, outcomes: historyOutcomes }),
      ),
    [historyPage, resolveName, historyOutcomes],
  )

  /** Every event on the page, so an opened one can be found by its id alone. */
  const eventsById = useMemo(() => {
    const map = new Map<string, HistoryEventRow>()
    for (const lap of runEvents.laps) {
      for (const event of lap.events) map.set(event.id, event)
    }
    for (const call of [...runEvents.calls, ...unattributedCalls]) {
      map.set(call.id, call)
    }
    return map
  }, [runEvents, unattributedCalls])

  /** The raw records behind an opened event: the FACTS, not current settings. */
  const openedRecord = useMemo(() => {
    if (panel.kind !== 'history-event') return null
    const hop = (historyPage?.runs ?? [])
      .flatMap((run) => run.laps)
      .flatMap((lap) => lap.hops)
      .find((entry) => entry.id === panel.eventId)
    if (hop) return { kind: 'hop' as const, hop }
    const hail = [
      ...(historyPage?.runs ?? []).flatMap((run) => run.hails),
      ...(historyPage?.unattributedHails ?? []),
    ].find((entry) => entry.id === panel.eventId)
    return hail ? { kind: 'hail' as const, hail } : null
  }, [panel, historyPage])

  const openHails = useMemo(
    () =>
      crew
        ? allHails.filter(
            (hail) => hail.crewId === crew.id && hail.acknowledgedAt === null,
          )
        : [],
    [allHails, crew],
  )

  const authoring = useMemo<SessionCanvasAuthoring | undefined>(() => {
    if (!crew) return undefined
    return {
      crewId: crew.id,
      onConnect: openDraft,
      onMove: moveCard,
      connecting: connectMode.kind !== 'off',
      connectSourceId:
        connectMode.kind === 'awaiting-target'
          ? connectMode.sourceSessionId
          : null,
      onPick: handlePick,
      onSelectRelay: (relayId) => {
        const relay = relays.find((entry) => entry.id === relayId)
        if (relay) openConnection(relay)
      },
      selectedRelayId: panel.kind === 'connection' ? panel.relayId : null,
      draftEdge:
        panel.kind === 'connection' &&
        panel.relayId === null &&
        draft?.recipient.kind === 'session' &&
        draft.recipient.sessionId
          ? {
              sourceSessionId: draft.sourceSessionId,
              targetSessionId: draft.recipient.sessionId,
            }
          : null,
      hint: connectModeHint(connectMode, resolveName),
      // Only while history is open AND a run is picked: the diagram is
      // otherwise about now, and a replay nobody asked for would be a canvas
      // quietly showing the past.
      runHighlight:
        historyOpen && selectedRun
          ? buildRunHighlight(selectedRun, historyOutcomes)
          : null,
      runBanner:
        historyOpen && selectedRun
          ? `Run from ${formatRunTime(selectedRun.startedAt, new Date())} · shown on current crew layout`
          : null,
    }
  }, [
    crew,
    openDraft,
    moveCard,
    connectMode,
    handlePick,
    relays,
    openConnection,
    panel,
    draft,
    resolveName,
    historyOpen,
    selectedRun,
    historyOutcomes,
  ])

  if (!crew || !selectedGroup) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Waypoints className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Start with a conversation</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Add existing conversations to a crew, then connect their replies.
        </p>
        <p className="max-w-sm text-xs text-muted-foreground/70">
          Conversations outside crews remain available in Flat.
        </p>
      </div>
    )
  }

  const armedCount = relays.filter((relay) => relay.armed).length
  const summary =
    relays.length === 0
      ? `${crew.sessionIds.length} conversation${crew.sessionIds.length === 1 ? '' : 's'} · 0 connections`
      : `${relays.length} connection${relays.length === 1 ? '' : 's'} · ${armedCount === 0 ? 'all off' : `${armedCount} on`}`

  return (
    <div
      data-crew-canvas
      className="flex h-full min-h-0 flex-col"
      onClickCapture={(event) => {
        // Selecting a crew is touching anything in it. Capture rather than
        // bubble so the crew is chosen even when the click also opens a card.
        const node = (event.target as HTMLElement).closest(
          '[data-canvas-crew-id]',
        )
        const crewId = node?.getAttribute('data-canvas-crew-id')
        if (!crewId || crewId === crew.id) return
        const left = leaveDraft(() => {
          setSelectedCrewId(crewId)
          closePanel()
        })
        // A pending discard decision also holds the card's own click action.
        if (!left) event.stopPropagation()
      }}
    >
      <CanvasToolbar
        crewName={crew.name}
        summary={summary}
        connecting={connectMode.kind !== 'off'}
        canConnect={crew.sessionIds.length >= 2}
        waitingCount={openHails.length}
        onAddConversation={() => leavePanel({ kind: 'add-conversations' })}
        onToggleConnect={() =>
          setConnectMode((current) => toggleConnectMode(current))
        }
        onCrewSettings={() => leavePanel({ kind: 'crew-settings' })}
        onHistory={() => {
          setHistoryOpen((open) => !open)
        }}
      />

      <div className="flex min-h-0 flex-1">
        <div
          data-canvas-left-column
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div data-canvas-graph className="min-h-0 flex-1 overflow-hidden">
            <SessionCanvas
              groups={groups}
              onOpen={onOpen}
              authoring={authoring}
            />
          </div>
          {historyOpen ? (
            <HistoryPanel
              crewName={crew.name}
              state={historyPanelState({
                loading: historyLoading,
                error: historyError,
                page: historyPage,
                visibleRuns: visibleRuns.length,
              })}
              runs={visibleRuns.map((run) =>
                buildRunRow(
                  run,
                  resolveName,
                  new Date(),
                  (id) => sessionsById.get(id)?.status ?? null,
                ),
              )}
              selectedRunId={selectedRun?.flowRunId ?? null}
              summary={selectedRun ? formatRunSummary(selectedRun) : null}
              laps={runEvents.laps}
              calls={runEvents.calls}
              unattributedCalls={unattributedCalls}
              selectedEventId={
                panel.kind === 'history-event' ? panel.eventId : null
              }
              filter={historyFilter}
              loadError={historyError}
              onFilterChange={setHistoryFilter}
              hasMore={historyPage?.hasMore ?? false}
              loadingOlder={historyLoadingOlder}
              olderError={olderError}
              onLoadOlder={() => {
                void loadOlderRuns()
              }}
              onSelectRun={(flowRunId) =>
                leaveDraft(() => {
                  setSelectedRunId(flowRunId)
                  applyPanel({ kind: 'none' })
                })
              }
              onSelectEvent={(eventId) =>
                leavePanel({ kind: 'history-event', eventId })
              }
              onRetry={() => {
                void loadHistory()
              }}
              onClose={() => {
                setHistoryOpen(false)
                if (panel.kind === 'history-event') applyPanel({ kind: 'none' })
              }}
            />
          ) : null}

          {/* The glossary the handed-back run carries (frame 07). Shown with the
          panel rather than only in one inspector, because "run", "lap" and
          "delivery" are the three words the whole surface is written in. */}
          {historyOpen && selectedRun?.status.word === 'handed-back' ? (
            <p className="border-t border-white/10 px-5 py-1.5 text-[10px] text-muted-foreground/70">
              {RUN_LAP_DELIVERY_GLOSSARY.join(' ')}
            </p>
          ) : null}
        </div>

        {panel.kind === 'connection' && draft ? (
          <div className="w-[340px] shrink-0">
            <ConnectionInspector
              sourceName={
                resolveName(draft.sourceSessionId) ?? 'This conversation'
              }
              recipientName={
                draft.recipient.kind === 'spawn'
                  ? draft.recipient.spec.name || 'a new session'
                  : draft.recipient.sessionId
                    ? resolveName(draft.recipient.sessionId)
                    : null
              }
              draft={draft}
              isNew={panel.relayId === null}
              dirty={
                savedDraft === null || connectionDraftIsDirty(draft, savedDraft)
              }
              saveError={saveError ?? relayError}
              recipientMissing={
                draft.recipient.kind === 'session' &&
                draft.recipient.sessionId !== null &&
                !sessionsById.has(draft.recipient.sessionId)
              }
              recipientOptions={recipientOptions}
              beforeDelivery={beforeDeliveryOptions({
                supportsReset,
                providerName: recipientProvider?.name ?? null,
                recipientName:
                  draft.recipient.kind === 'session' &&
                  draft.recipient.sessionId
                    ? resolveName(draft.recipient.sessionId)
                    : null,
              })}
              customOpenerNote={customOpenerNote(draft, supportsReset)}
              recipientNote={recipientNote}
              problem={connectionDraftProblem(draft, relays, panel.relayId, {
                supportsReset,
              })}
              busy={busy}
              projectOptions={projectOptions}
              providerOptions={providerOptions}
              modelOptions={modelOptions}
              effortOptions={effortOptions}
              spawnAccounts={spawnAccounts}
              onRecipientChange={(optionId) => {
                if (!draft) return
                // R8 is re-asked here, not just the field replaced (M2): the
                // *Before delivery* choice is about what the RECIPIENT's
                // provider can do, so a new recipient can turn a stored
                // choice into one the engine would carry as an ordinary
                // message.
                const provider =
                  optionId === SPAWN_RECIPIENT_OPTION_ID
                    ? undefined
                    : providersById.get(
                        sessionsById.get(optionId)?.providerId ?? '',
                      )
                const changed = changeDraftRecipient(
                  draft,
                  optionId === SPAWN_RECIPIENT_OPTION_ID
                    ? { kind: 'spawn', spec: { ...EMPTY_SPAWN_SPEC } }
                    : { kind: 'session', sessionId: optionId },
                  {
                    supportsReset: provider?.supportsConversationReset ?? false,
                    providerName: provider?.name ?? null,
                  },
                )
                setDraft(changed.draft)
                setRecipientNote(changed.note)
              }}
              onSpawnChange={(patch: Partial<ConnectionSpawnSpec>) =>
                setDraft((current) => {
                  if (!current || current.recipient.kind !== 'spawn') {
                    return current
                  }
                  return {
                    ...current,
                    recipient: {
                      kind: 'spawn',
                      spec: {
                        ...current.recipient.spec,
                        ...patch,
                        // Changing provider re-asks the account question: ids
                        // belong to one provider, so carrying the old choice
                        // over would name an account that cannot serve it.
                        ...(patch.providerId !== undefined &&
                        patch.providerId !== current.recipient.spec.providerId
                          ? {
                              providerAccountId:
                                resolveInitialProviderAccountSelection({
                                  accounts: providerAccountsForProvider(
                                    accounts,
                                    patch.providerId,
                                  ),
                                  hasActiveSession: false,
                                }),
                            }
                          : {}),
                      },
                    },
                  }
                })
              }
              onEnabledChange={(enabled) =>
                setDraft((current) =>
                  current ? { ...current, enabled } : current,
                )
              }
              onConditionKindChange={(kind) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        condition:
                          kind === 'any'
                            ? { kind: 'any' }
                            : {
                                kind: 'token',
                                token:
                                  current.condition.kind === 'token'
                                    ? current.condition.token
                                    : '',
                              },
                      }
                    : current,
                )
              }
              onConditionTokenChange={(token) =>
                setDraft((current) =>
                  current
                    ? { ...current, condition: { kind: 'token', token } }
                    : current,
                )
              }
              onBeforeDeliveryChange={(mode: BeforeDeliveryMode) =>
                setDraft((current) =>
                  current ? { ...current, beforeDelivery: mode } : current,
                )
              }
              onCustomOpenerChange={(customOpener) =>
                setDraft((current) =>
                  current ? { ...current, customOpener } : current,
                )
              }
              onInstructionsChange={(instructions) =>
                setDraft((current) =>
                  current ? { ...current, instructions } : current,
                )
              }
              onSave={() => {
                void save()
              }}
              onCancel={() => leavePanel({ kind: 'none' })}
              onDelete={() => {
                void remove()
              }}
              onClose={() => leavePanel({ kind: 'none' })}
            />
          </div>
        ) : null}

        {panel.kind === 'crew-settings' ? (
          <div className="w-[340px] shrink-0">
            <CrewSettingsPanel
              crewName={crew.name}
              members={crew.members}
              resolveName={resolveName}
              deliveryLimit={crew.roundCap}
              attentionMinutes={crew.stallMinutes}
              defaultDeliveryLimit={DEFAULT_CREW_ROUND_CAP}
              defaultAttentionMinutes={DEFAULT_CREW_STALL_MINUTES}
              busy={busy}
              running={crewIsRunning}
              batonNameProblem={batonNameProblem}
              batonNameDrafts={batonNameDrafts}
              onCrewNameChange={(name) => {
                void sessionCrewApi.update(crew.id, { name }).then(loadCrews)
              }}
              onBatonNameEdit={(sessionId, batonName) =>
                setBatonNameDrafts((drafts) => ({
                  ...drafts,
                  [sessionId]: batonName,
                }))
              }
              onBatonNameCommit={(sessionId) => {
                void commitBatonName(sessionId)
              }}
              onDeliveryLimitChange={(roundCap) => {
                void setLoopLimit({ roundCap })
              }}
              onAttentionMinutesChange={(stallMinutes) => {
                void setLoopLimit({ stallMinutes })
              }}
              onAddConversation={() =>
                leavePanel({ kind: 'add-conversations' })
              }
              onRemoveMember={(sessionId) => {
                void removeMember(sessionId)
              }}
              onClose={() => leavePanel({ kind: 'none' })}
            />
          </div>
        ) : null}

        {panel.kind === 'history-event' && openedRecord ? (
          <div className="w-[340px] shrink-0">
            <HistoryEventInspector
              title={eventsById.get(panel.eventId)?.title ?? 'Recorded event'}
              tone={eventsById.get(panel.eventId)?.tone ?? 'unknown'}
              facts={
                openedRecord.kind === 'hop'
                  ? {
                      source:
                        resolveName(openedRecord.hop.sourceSessionId) ??
                        'a conversation that is gone',
                      recipient:
                        resolveName(
                          openedRecord.hop.spawnedSessionId ??
                            openedRecord.hop.targetSessionId ??
                            '',
                        ) ?? 'nobody',
                      baton: openedRecord.hop.baton,
                      outcome:
                        eventsById.get(panel.eventId)?.outcomeLabel ??
                        historyOutcomeWord('unknown'),
                      timestamp: openedRecord.hop.firedAt,
                      // The RECORD's preview, never the conversation as it
                      // reads today (promise 6).
                      responsePreview: openedRecord.hop.payloadPreview,
                      message: null,
                    }
                  : {
                      source:
                        resolveName(openedRecord.hail.sessionId) ??
                        'a conversation that is gone',
                      recipient: 'you',
                      baton: openedRecord.hail.baton,
                      outcome:
                        eventsById.get(panel.eventId)?.outcomeLabel ??
                        historyOutcomeWord('unknown'),
                      timestamp: openedRecord.hail.raisedAt,
                      responsePreview: null,
                      message: openedRecord.hail.message,
                    }
              }
              isCall={openedRecord.kind === 'hail'}
              acknowledged={
                openedRecord.kind === 'hail' &&
                openedRecord.hail.acknowledgedAt !== null
              }
              // The OTHER calls in history, which is what the sentence
              // says (L3). A hop is not a call, so subtracting one for it
              // undercounted every call on the page by exactly one.
              earlierCallCount={Math.max(
                0,
                (historyPage?.runs ?? []).reduce(
                  (total, run) => total + run.hails.length,
                  (historyPage?.unattributedHails ?? []).length,
                ) - (openedRecord.kind === 'hail' ? 1 : 0),
              )}
              openRecipientLabel={
                openedRecord.kind === 'hop'
                  ? resolveName(
                      openedRecord.hop.spawnedSessionId ??
                        openedRecord.hop.targetSessionId ??
                        '',
                    )
                  : resolveName(openedRecord.hail.sessionId)
              }
              hasCurrentConnection={
                openedRecord.kind === 'hop' &&
                relays.some((relay) => relay.id === openedRecord.hop.relayId)
              }
              busy={busy}
              onOpenRecipient={() => {
                const sessionId =
                  openedRecord.kind === 'hop'
                    ? (openedRecord.hop.spawnedSessionId ??
                      openedRecord.hop.targetSessionId)
                    : openedRecord.hail.sessionId
                const card = groups
                  .flatMap((group) => group.cards)
                  .find((entry) => entry.session.id === sessionId)
                if (card) onOpen(card)
              }}
              onViewCurrentConnection={() => {
                if (openedRecord.kind !== 'hop') return
                const relay = relays.find(
                  (entry) => entry.id === openedRecord.hop.relayId,
                )
                if (relay) openConnection(relay)
              }}
              onMarkSeen={() => {
                if (openedRecord.kind !== 'hail') return
                // Acknowledge, and ONLY acknowledge. No relay call, no send,
                // no restart — the whole point of the sentence beside it.
                void acknowledgeHail(openedRecord.hail.id).then(() =>
                  loadHistory(),
                )
              }}
              onClose={() => leavePanel({ kind: 'none' })}
            />
          </div>
        ) : null}

        {panel.kind === 'add-conversations' ? (
          <div className="w-[340px] shrink-0">
            <AddConversationsPanel
              crewName={crew.name}
              query={addQuery}
              onQueryChange={setAddQuery}
              projectOptions={addProjectOptions}
              selectedProjectId={addProjectId}
              onProjectChange={setAddProjectId}
              available={available}
              selectedIds={addSelection}
              onToggle={(sessionId) =>
                setAddSelection((current) =>
                  current.includes(sessionId)
                    ? current.filter((id) => id !== sessionId)
                    : [...current, sessionId],
                )
              }
              alreadyInCrew={crew.sessionIds
                .map((sessionId) => resolveName(sessionId))
                .filter((name): name is string => name !== null)}
              busy={busy}
              onAdd={() => {
                void addConversations()
              }}
              onClose={() => leavePanel({ kind: 'none' })}
            />
          </div>
        ) : null}
      </div>

      {/* Frame 10-02. Leaving an unfinished draft asks before losing it. */}
      {confirmDiscard ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70">
          <div
            role="alertdialog"
            aria-label="Discard this draft?"
            className="flex w-80 flex-col gap-2 rounded-lg border border-white/15 bg-card px-4 py-3"
          >
            <p className="text-sm font-medium">Discard this draft?</p>
            <p className="text-[11px] text-muted-foreground">
              This connection has not been saved. Leaving it will discard the
              draft.
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDiscard(null)}
                className="h-8 px-3 text-[11px]"
              >
                Keep editing
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const leaving = confirmDiscard
                  setConfirmDiscard(null)
                  setDraft(null)
                  setSavedDraft(null)
                  setSaveError(null)
                  setRecipientNote(null)
                  clearRelayError()
                  // The action decides where they land -- another draft, a
                  // stored wire, a recorded event, a run, or nothing. The
                  // guard only asked.
                  leaving.run()
                }}
                className="h-8 px-3 text-[11px]"
              >
                Discard draft
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
