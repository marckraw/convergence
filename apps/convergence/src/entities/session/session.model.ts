import { create } from 'zustand'
import type {
  ConversationItem,
  ConversationPatchEvent,
  CreateAndStartGlobalSessionRequest,
  CreateAndStartSessionRequest,
  QueuedInputPatchEvent,
  NeedsYouDismissals,
  NeedsYouDisposition,
  ReasoningEffort,
  SendSessionMessageRequest,
  SessionQueuedInput,
  SessionSummary,
} from './session.types'
import { sessionApi, providerApi, remoteProjectApi } from './session.api'
import type { ProviderInfo } from './session.types'
import {
  catalogInForce,
  landedProviderCatalog,
  LOCAL_PROVIDER_CATALOG_SOURCE,
  providerCatalogInForce,
  selectableProviderDescriptors,
  type ProviderCatalogEntry,
  type ProviderCatalogs,
  type ProviderCatalogSource,
  type ProviderCatalogState,
} from './provider-catalog.pure'
import {
  landedRemoteProjectCatalog,
  type RemoteProjectCatalogs,
  type RemoteProjectCatalogState,
} from './remote-project-catalog.pure'
import { sessionForkApi } from './session-fork.api'
import type {
  ForkFullInput,
  ForkSummarizeWith,
  ForkSummary,
  ForkSummaryInput,
} from './session-fork.types'

const RECENT_SESSIONS_CAP = 10

interface SessionState {
  sessions: SessionSummary[]
  globalSessions: SessionSummary[]
  globalChatSessions: SessionSummary[]
  activeConversation: ConversationItem[]
  activeConversationSessionId: string | null
  activeGlobalConversation: ConversationItem[]
  activeGlobalConversationSessionId: string | null
  queuedInputsBySessionId: Record<string, SessionQueuedInput[]>
  needsYouDismissals: NeedsYouDismissals
  recentSessionIds: string[]
  currentProjectId: string | null
  activeSessionId: string | null
  activeProjectSessionId: string | null
  activeGlobalSessionId: string | null
  draftWorkspaceId: string | null
  /**
   * Every machine's provider catalog, keyed by the machine it was read from
   * (MAR-2682).
   *
   * A map and never a flat list. One list cannot say which machine it is true
   * of, and the composer holding one was exactly the contradiction S3 closes:
   * the strip named a daemon while the row above it offered whatever this
   * laptop had installed. Read through `providerCatalogInForce`, never
   * directly -- the key alone does not prove the pairing still holds.
   */
  providerCatalogs: ProviderCatalogs
  /**
   * Every machine's Projects, keyed by the machine they were read from
   * (MAR-2689).
   *
   * A second map beside the provider catalogs rather than a field inside them:
   * they answer different questions at different cadences, and a machine that
   * offers no Projects is a perfectly normal machine whose providers still
   * matter. Read through `catalogInForce` for the same reason that one is --
   * the key alone does not prove the pairing still holds.
   */
  remoteProjectCatalogs: RemoteProjectCatalogs
  error: string | null
}

interface SessionActions {
  loadSessions: (projectId: string) => Promise<void>
  loadGlobalSessions: () => Promise<void>
  loadGlobalChatSessions: () => Promise<void>
  loadRecents: () => Promise<void>
  recordRecentSession: (id: string) => void
  loadProviders: () => Promise<void>
  loadProviderCatalog: (source: ProviderCatalogSource) => Promise<void>
  loadRemoteProjectCatalog: (source: ProviderCatalogSource) => Promise<void>
  dismissNeedsYouSession: (id: string) => Promise<void>
  createAndStartSession: (
    request: CreateAndStartSessionRequest,
  ) => Promise<void>
  createAndStartGlobalSession: (
    request: CreateAndStartGlobalSessionRequest,
  ) => Promise<SessionSummary | null>
  createTerminalSession: (
    projectId: string,
    workspaceId: string | null,
    name: string,
  ) => Promise<SessionSummary>
  approveSession: (id: string, providerApprovalId?: string) => Promise<void>
  denySession: (id: string, providerApprovalId?: string) => Promise<void>
  sendMessageToSession: (request: SendSessionMessageRequest) => Promise<void>
  compactSessionContext: (id: string, instructions?: string) => Promise<void>
  stopSession: (id: string) => Promise<void>
  archiveSession: (id: string) => Promise<void>
  unarchiveSession: (id: string) => Promise<void>
  deleteSession: (id: string, projectId?: string | null) => Promise<void>
  loadActiveConversation: (sessionId: string) => Promise<void>
  loadActiveGlobalConversation: (sessionId: string) => Promise<void>
  loadQueuedInputs: (sessionId: string) => Promise<void>
  cancelQueuedInput: (id: string) => Promise<void>
  prepareForProject: (projectId: string | null) => void
  beginSessionDraft: (workspaceId: string | null) => void
  setActiveSession: (id: string | null) => void
  setActiveGlobalSession: (id: string | null) => void
  handleSessionSummaryUpdate: (summary: SessionSummary) => void
  handleConversationPatched: (event: ConversationPatchEvent) => void
  handleQueuedInputPatched: (event: QueuedInputPatchEvent) => void
  previewFork: (
    parentSessionId: string,
    requestId?: string,
    summarizeWith?: ForkSummarizeWith,
  ) => Promise<ForkSummary>
  forkFull: (input: ForkFullInput) => Promise<SessionSummary>
  forkSummary: (input: ForkSummaryInput) => Promise<SessionSummary>
  setPrimarySurface: (
    id: string,
    surface: 'conversation' | 'terminal',
  ) => Promise<SessionSummary>
  setSessionModelSelection: (
    id: string,
    input: {
      providerId: string
      model: string | null
      effort: ReasoningEffort | null
    },
  ) => Promise<SessionSummary>
  clearError: () => void
}

export type SessionStore = SessionState & SessionActions

function resolveNeedsYouDisposition(
  session: SessionSummary,
): NeedsYouDisposition | null {
  switch (session.attention) {
    case 'needs-approval':
    case 'needs-input':
      return 'snoozed'
    case 'failed':
    case 'finished':
      return 'acknowledged'
    default:
      return null
  }
}

function pruneNeedsYouDismissals(
  dismissals: NeedsYouDismissals,
  sessions: SessionSummary[],
): NeedsYouDismissals {
  return Object.fromEntries(
    Object.entries(dismissals).filter(([sessionId, dismissal]) =>
      sessions.some(
        (session) =>
          session.id === sessionId && session.updatedAt === dismissal.updatedAt,
      ),
    ),
  )
}

function removeNeedsYouDismissal(
  dismissals: NeedsYouDismissals,
  sessionId: string,
): NeedsYouDismissals {
  return Object.fromEntries(
    Object.entries(dismissals).filter(([id]) => id !== sessionId),
  )
}

function upsertSummary(
  sessions: SessionSummary[],
  summary: SessionSummary,
): SessionSummary[] {
  return sessions.some((session) => session.id === summary.id)
    ? sessions.map((session) => (session.id === summary.id ? summary : session))
    : [summary, ...sessions]
}

function findSummaryById(
  state: Pick<
    SessionState,
    'sessions' | 'globalSessions' | 'globalChatSessions'
  >,
  id: string,
): SessionSummary | null {
  return (
    state.sessions.find((session) => session.id === id) ??
    state.globalChatSessions.find((session) => session.id === id) ??
    state.globalSessions.find((session) => session.id === id) ??
    null
  )
}

function upsertConversationItem(
  items: ConversationItem[],
  nextItem: ConversationItem,
): ConversationItem[] {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id)

  if (existingIndex >= 0) {
    const existing = items[existingIndex]
    if (existing?.sequence === nextItem.sequence) {
      const nextItems = items.slice()
      nextItems[existingIndex] = nextItem
      return nextItems
    }

    return insertConversationItem(
      items.filter((item) => item.id !== nextItem.id),
      nextItem,
    )
  }

  return insertConversationItem(items, nextItem)
}

function insertConversationItem(
  items: ConversationItem[],
  nextItem: ConversationItem,
): ConversationItem[] {
  const last = items[items.length - 1]
  if (!last || last.sequence <= nextItem.sequence) {
    return [...items, nextItem]
  }

  const insertIndex = items.findIndex(
    (item) => item.sequence > nextItem.sequence,
  )
  if (insertIndex < 0) {
    return [...items, nextItem]
  }

  return [...items.slice(0, insertIndex), nextItem, ...items.slice(insertIndex)]
}

function upsertQueuedInput(
  items: SessionQueuedInput[],
  nextItem: SessionQueuedInput,
): SessionQueuedInput[] {
  const visibleStates = new Set(['queued', 'dispatching', 'failed'])
  const nextItems = items.some((item) => item.id === nextItem.id)
    ? items.map((item) => (item.id === nextItem.id ? nextItem : item))
    : [...items, nextItem]

  return nextItems
    .filter((item) => visibleStates.has(item.state))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function persistRecents(ids: string[]): void {
  void sessionApi.setRecentIds(ids).catch(() => undefined)
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  globalSessions: [],
  globalChatSessions: [],
  activeConversation: [],
  activeConversationSessionId: null,
  activeGlobalConversation: [],
  activeGlobalConversationSessionId: null,
  queuedInputsBySessionId: {},
  needsYouDismissals: {},
  recentSessionIds: [],
  currentProjectId: null,
  activeSessionId: null,
  activeProjectSessionId: null,
  activeGlobalSessionId: null,
  draftWorkspaceId: null,
  providerCatalogs: {},
  remoteProjectCatalogs: {},
  error: null,

  loadSessions: async (projectId: string) => {
    const previousProjectId = get().currentProjectId
    if (previousProjectId !== projectId) {
      set({
        currentProjectId: projectId,
        sessions: [],
        activeSessionId: null,
        activeProjectSessionId: null,
        activeConversation: [],
        activeConversationSessionId: null,
        queuedInputsBySessionId: {},
        draftWorkspaceId: null,
      })
    }

    const sessions = await sessionApi.getSummariesByProjectId(projectId)
    set((state) => ({
      currentProjectId: projectId,
      sessions,
      activeSessionId: sessions.some(
        (session) => session.id === state.activeSessionId,
      )
        ? state.activeSessionId
        : null,
      activeProjectSessionId: sessions.some(
        (session) => session.id === state.activeProjectSessionId,
      )
        ? state.activeProjectSessionId
        : null,
      activeConversation: sessions.some(
        (session) => session.id === state.activeSessionId,
      )
        ? state.activeConversation
        : [],
      activeConversationSessionId: sessions.some(
        (session) => session.id === state.activeSessionId,
      )
        ? state.activeConversationSessionId
        : null,
      draftWorkspaceId: sessions.some(
        (session) => session.id === state.activeSessionId,
      )
        ? state.draftWorkspaceId
        : null,
    }))
  },

  loadGlobalSessions: async () => {
    const globalSessions = await sessionApi.getAllSummaries()
    const persistedDismissals = await sessionApi.getNeedsYouDismissals()
    const nextDismissals = pruneNeedsYouDismissals(
      persistedDismissals,
      globalSessions,
    )

    if (
      JSON.stringify(nextDismissals) !== JSON.stringify(persistedDismissals)
    ) {
      await sessionApi.setNeedsYouDismissals(nextDismissals)
    }

    set({
      globalSessions,
      needsYouDismissals: nextDismissals,
    })
  },

  loadGlobalChatSessions: async () => {
    const globalChatSessions = await sessionApi.getGlobalSummaries()
    set((state) => ({
      globalChatSessions,
      activeGlobalSessionId: globalChatSessions.some(
        (session) => session.id === state.activeGlobalSessionId,
      )
        ? state.activeGlobalSessionId
        : null,
      activeGlobalConversation: globalChatSessions.some(
        (session) => session.id === state.activeGlobalSessionId,
      )
        ? state.activeGlobalConversation
        : [],
      activeGlobalConversationSessionId: globalChatSessions.some(
        (session) => session.id === state.activeGlobalSessionId,
      )
        ? state.activeGlobalConversationSessionId
        : null,
    }))
  },

  loadRecents: async () => {
    try {
      const persisted = await sessionApi.getRecentIds()
      const globalSessions = get().globalSessions
      const known = new Set(globalSessions.map((session) => session.id))
      const pruned = persisted
        .filter((id) => known.has(id))
        .slice(0, RECENT_SESSIONS_CAP)
      set({ recentSessionIds: pruned })
      if (pruned.length !== persisted.length) {
        persistRecents(pruned)
      }
    } catch {
      // Recency is advisory; preserve existing state on transient failures.
    }
  },

  recordRecentSession: (id: string) => {
    const prev = get().recentSessionIds
    const next = [id, ...prev.filter((entry) => entry !== id)].slice(
      0,
      RECENT_SESSIONS_CAP,
    )
    if (
      next.length === prev.length &&
      next.every((entry, index) => entry === prev[index])
    ) {
      return
    }
    set({ recentSessionIds: next })
    persistRecents(next)
  },

  /** This machine's catalog. What every surface but the composer means. */
  loadProviders: async () => {
    await get().loadProviderCatalog(LOCAL_PROVIDER_CATALOG_SOURCE)
  },

  /**
   * Asks one machine what it runs, and files the answer under that machine
   * (MAR-2682).
   *
   * Every state it passes through carries the source it is about, pending
   * included: two Endpoints are asked concurrently the moment he switches
   * between them, and a `pending` marker with no source on it would let the
   * row read the other machine's round trip as its own.
   *
   * The source is re-checked after the await, not before it: an Endpoint can
   * be repointed while its catalog is in flight, and a reply about the address
   * it used to have is not an answer about the address it has now. Reading
   * `providerCatalogInForce` at the write is what makes that reply land
   * nowhere instead of landing wrong.
   *
   * `pending` is written only when nothing about this machine is in force. A
   * re-ask about a machine already answered for -- remounting the composer, or
   * a setting that changes what this machine's own catalog is filtered to --
   * keeps the answer on screen while the new one is fetched, because it is
   * still an answer about that machine. What must never be shown is a *stale*
   * one, and a stale entry is by construction not in force, so it goes to
   * `pending` and the row says it is asking.
   */
  loadProviderCatalog: async (source: ProviderCatalogSource) => {
    set((state) =>
      providerCatalogInForce(state.providerCatalogs, source)
        ? state
        : {
            providerCatalogs: {
              ...state.providerCatalogs,
              [source.executionHostId]: { status: 'pending', source },
            },
          },
    )

    const commit = (next: ProviderCatalogState) => {
      set((state) =>
        providerCatalogInForce(state.providerCatalogs, source)
          ? {
              providerCatalogs: {
                ...state.providerCatalogs,
                [source.executionHostId]: next,
              },
            }
          : state,
      )
    }

    try {
      const catalog = await providerApi.getAll(source.executionHostId)
      commit(landedProviderCatalog(source, catalog))
    } catch (error) {
      commit({
        status: 'failed',
        source,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  },

  /**
   * Asks one machine where it can work, and files the answer under that machine
   * (MAR-2689).
   *
   * The same shape as `loadProviderCatalog`, deliberately and line for line:
   * every state carries the source it is about, `pending` is written only when
   * nothing about this machine is in force, and the source is re-checked *after*
   * the await so a reply about the address an Endpoint has just been edited
   * away from lands nowhere instead of landing wrong.
   */
  loadRemoteProjectCatalog: async (source: ProviderCatalogSource) => {
    set((state) =>
      catalogInForce(state.remoteProjectCatalogs, source)
        ? state
        : {
            remoteProjectCatalogs: {
              ...state.remoteProjectCatalogs,
              [source.executionHostId]: { status: 'pending', source },
            },
          },
    )

    const commit = (next: RemoteProjectCatalogState) => {
      set((state) =>
        catalogInForce(state.remoteProjectCatalogs, source)
          ? {
              remoteProjectCatalogs: {
                ...state.remoteProjectCatalogs,
                [source.executionHostId]: next,
              },
            }
          : state,
      )
    }

    try {
      const catalog = await remoteProjectApi.getAll(source.executionHostId)
      commit(landedRemoteProjectCatalog(source, catalog))
    } catch (error) {
      commit({
        status: 'failed',
        source,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  },

  dismissNeedsYouSession: async (id: string) => {
    const session = get().globalSessions.find((entry) => entry.id === id)
    if (!session) {
      return
    }

    const disposition = resolveNeedsYouDisposition(session)
    if (!disposition) {
      return
    }

    const nextDismissals = {
      ...get().needsYouDismissals,
      [id]: {
        updatedAt: session.updatedAt,
        disposition,
      },
    }

    set({ needsYouDismissals: nextDismissals })

    try {
      await sessionApi.setNeedsYouDismissals(nextDismissals)
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to persist needs-you dismissal',
      })
    }
  },

  createAndStartSession: async (request) => {
    set({ error: null })
    try {
      const session = await sessionApi.create({
        projectId: request.projectId,
        workspaceId: request.workspaceId,
        providerId: request.providerId,
        model: request.model,
        effort: request.effort,
        serviceTier: request.serviceTier,
        permissionConfig: request.permissionConfig,
        name: request.name,
        executionHost: request.executionHost,
        workAddress: request.workAddress,
      })
      await sessionApi.start({
        sessionId: session.id,
        message: request.message,
        attachmentIds: request.attachmentIds,
        skillSelections: request.skillSelections,
        contextItemIds: request.contextItemIds,
        providerAccountId: request.providerAccountId,
      })
      set((state) => ({
        currentProjectId: request.projectId,
        sessions: [session, ...state.sessions],
        globalSessions: [session, ...state.globalSessions],
        activeConversation: [],
        activeConversationSessionId: session.id,
        queuedInputsBySessionId: {
          ...state.queuedInputsBySessionId,
          [session.id]: [],
        },
        needsYouDismissals: Object.fromEntries(
          Object.entries(state.needsYouDismissals).filter(
            ([sessionId]) => sessionId !== session.id,
          ),
        ),
        activeSessionId: session.id,
        activeProjectSessionId: session.id,
        draftWorkspaceId: null,
      }))
      get().recordRecentSession(session.id)
      void get().loadActiveConversation(session.id)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to start session',
      })
    }
  },

  createAndStartGlobalSession: async (request) => {
    set({ error: null })
    try {
      const session = await sessionApi.create({
        contextKind: 'global',
        providerId: request.providerId,
        model: request.model,
        effort: request.effort,
        serviceTier: request.serviceTier,
        permissionConfig: request.permissionConfig,
        name: request.name,
      })
      await sessionApi.start({
        sessionId: session.id,
        message: request.message,
        attachmentIds: request.attachmentIds,
        skillSelections: request.skillSelections,
        providerAccountId: request.providerAccountId,
      })
      set((state) => ({
        globalChatSessions: [session, ...state.globalChatSessions],
        globalSessions: [session, ...state.globalSessions],
        activeGlobalConversation: [],
        activeGlobalConversationSessionId: session.id,
        queuedInputsBySessionId: {
          ...state.queuedInputsBySessionId,
          [session.id]: [],
        },
        needsYouDismissals: Object.fromEntries(
          Object.entries(state.needsYouDismissals).filter(
            ([sessionId]) => sessionId !== session.id,
          ),
        ),
        activeGlobalSessionId: session.id,
      }))
      get().recordRecentSession(session.id)
      void get().loadActiveGlobalConversation(session.id)
      return session
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to start global session',
      })
      return null
    }
  },

  createTerminalSession: async (projectId, workspaceId, name) => {
    const session = await sessionApi.create({
      projectId,
      workspaceId,
      providerId: 'shell',
      model: null,
      effort: null,
      name,
      primarySurface: 'terminal',
    })
    set((state) => ({
      currentProjectId: projectId,
      sessions:
        state.currentProjectId === projectId
          ? [session, ...state.sessions]
          : state.sessions,
      globalSessions: [session, ...state.globalSessions],
      activeConversation: [],
      activeConversationSessionId: session.id,
      queuedInputsBySessionId: {
        ...state.queuedInputsBySessionId,
        [session.id]: [],
      },
      activeSessionId: session.id,
      activeProjectSessionId: session.id,
      draftWorkspaceId: null,
    }))
    get().recordRecentSession(session.id)
    return session
  },

  approveSession: async (id: string, providerApprovalId?: string) => {
    set({ error: null })
    try {
      await sessionApi.approve(id, providerApprovalId)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to approve',
      })
    }
  },

  denySession: async (id: string, providerApprovalId?: string) => {
    set({ error: null })
    try {
      await sessionApi.deny(id, providerApprovalId)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to deny',
      })
    }
  },

  sendMessageToSession: async (request) => {
    set({ error: null })
    try {
      await sessionApi.sendMessage(request)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to send message',
      })
    }
  },

  compactSessionContext: async (id: string, instructions?: string) => {
    set({ error: null })
    try {
      await sessionApi.compactContext(id, instructions)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      set({ error: error.message })
      throw error
    }
  },

  stopSession: async (id: string) => {
    try {
      await sessionApi.stop(id)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to stop',
      })
    }
  },

  archiveSession: async (id: string) => {
    const previousDismissals = get().needsYouDismissals
    const nextDismissals = removeNeedsYouDismissal(previousDismissals, id)
    set({ needsYouDismissals: nextDismissals })

    try {
      await sessionApi.setNeedsYouDismissals(nextDismissals)
      await sessionApi.archive(id)
    } catch (err) {
      set({ needsYouDismissals: previousDismissals })
      void sessionApi
        .setNeedsYouDismissals(previousDismissals)
        .catch(() => undefined)
      set({
        error: err instanceof Error ? err.message : 'Failed to archive',
      })
    }
  },

  unarchiveSession: async (id: string) => {
    try {
      await sessionApi.unarchive(id)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to unarchive',
      })
    }
  },

  deleteSession: async (id: string, projectId?: string | null) => {
    try {
      await sessionApi.delete(id)
      const sessions = projectId
        ? await sessionApi.getSummariesByProjectId(projectId)
        : get().sessions
      const globalSessions = get().globalSessions.filter(
        (session) => session.id !== id,
      )
      const globalChatSessions = get().globalChatSessions.filter(
        (session) => session.id !== id,
      )
      const { activeSessionId } = get()
      const { activeGlobalSessionId } = get()
      const nextDismissals = removeNeedsYouDismissal(
        get().needsYouDismissals,
        id,
      )
      await sessionApi.setNeedsYouDismissals(nextDismissals)
      const prevRecents = get().recentSessionIds
      const nextRecents = prevRecents.filter((entry) => entry !== id)
      const queuedInputsBySessionId = Object.fromEntries(
        Object.entries(get().queuedInputsBySessionId).filter(
          ([sessionId]) => sessionId !== id,
        ),
      )
      set({
        sessions,
        globalSessions,
        globalChatSessions,
        needsYouDismissals: nextDismissals,
        recentSessionIds: nextRecents,
        queuedInputsBySessionId,
        activeSessionId: activeSessionId === id ? null : activeSessionId,
        activeProjectSessionId:
          activeSessionId === id ? null : get().activeProjectSessionId,
        activeGlobalSessionId:
          activeGlobalSessionId === id ? null : activeGlobalSessionId,
        activeConversation:
          activeSessionId === id ? [] : get().activeConversation,
        activeConversationSessionId:
          activeSessionId === id ? null : get().activeConversationSessionId,
        activeGlobalConversation:
          activeGlobalSessionId === id ? [] : get().activeGlobalConversation,
        activeGlobalConversationSessionId:
          activeGlobalSessionId === id
            ? null
            : get().activeGlobalConversationSessionId,
        draftWorkspaceId:
          activeSessionId === id ? null : get().draftWorkspaceId,
      })
      if (nextRecents.length !== prevRecents.length) {
        persistRecents(nextRecents)
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete',
      })
    }
  },

  loadActiveConversation: async (sessionId: string) => {
    const conversation = await sessionApi.getConversation(sessionId)
    set((state) =>
      state.activeSessionId === sessionId
        ? {
            activeConversation: conversation,
            activeConversationSessionId: sessionId,
          }
        : {},
    )
  },

  loadActiveGlobalConversation: async (sessionId: string) => {
    const conversation = await sessionApi.getConversation(sessionId)
    set((state) =>
      state.activeGlobalSessionId === sessionId
        ? {
            activeGlobalConversation: conversation,
            activeGlobalConversationSessionId: sessionId,
          }
        : {},
    )
  },

  loadQueuedInputs: async (sessionId: string) => {
    const queuedInputs = await sessionApi.getQueuedInputs(sessionId)
    set((state) =>
      state.activeSessionId === sessionId ||
      state.activeGlobalSessionId === sessionId
        ? {
            queuedInputsBySessionId: {
              ...state.queuedInputsBySessionId,
              [sessionId]: queuedInputs,
            },
          }
        : {},
    )
  },

  cancelQueuedInput: async (id: string) => {
    set({ error: null })
    try {
      await sessionApi.cancelQueuedInput(id)
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to cancel queued input',
      })
    }
  },

  prepareForProject: (projectId) =>
    set({
      currentProjectId: projectId,
      sessions: [],
      activeSessionId: null,
      activeProjectSessionId: null,
      activeConversation: [],
      activeConversationSessionId: null,
      queuedInputsBySessionId: {},
      draftWorkspaceId: null,
    }),

  beginSessionDraft: (workspaceId) =>
    set({
      activeSessionId: null,
      activeProjectSessionId: null,
      activeConversation: [],
      activeConversationSessionId: null,
      queuedInputsBySessionId: {},
      draftWorkspaceId: workspaceId,
    }),

  setActiveSession: (id) => {
    const target = id ? findSummaryById(get(), id) : null
    if (target?.contextKind === 'global') {
      get().setActiveGlobalSession(id)
      return
    }

    set((state) => ({
      activeSessionId: id,
      activeProjectSessionId: id,
      activeConversation:
        id !== null && state.activeConversationSessionId === id
          ? state.activeConversation
          : [],
      activeConversationSessionId: id,
      draftWorkspaceId: null,
    }))
    if (id !== null) {
      get().recordRecentSession(id)
      void get().loadActiveConversation(id)
      void get().loadQueuedInputs(id)
    }
  },

  setActiveGlobalSession: (id) => {
    set((state) => ({
      activeGlobalSessionId: id,
      activeGlobalConversation:
        id !== null && state.activeGlobalConversationSessionId === id
          ? state.activeGlobalConversation
          : [],
      activeGlobalConversationSessionId: id,
    }))
    if (id !== null) {
      get().recordRecentSession(id)
      void get().loadActiveGlobalConversation(id)
      void get().loadQueuedInputs(id)
    }
  },

  handleSessionSummaryUpdate: (session: SessionSummary) => {
    const currentProjectId = get().currentProjectId
    const state = get()
    const nextGlobalSessions = upsertSummary(state.globalSessions, session)
    const nextGlobalChatSessions =
      session.contextKind === 'global'
        ? upsertSummary(state.globalChatSessions, session)
        : state.globalChatSessions.some((entry) => entry.id === session.id)
          ? state.globalChatSessions.filter((entry) => entry.id !== session.id)
          : state.globalChatSessions
    const nextSessions =
      state.sessions.some((s) => s.id === session.id) ||
      (session.contextKind === 'project' &&
        currentProjectId &&
        session.projectId === currentProjectId)
        ? upsertSummary(state.sessions, session)
        : state.sessions
    const nextDismissals = pruneNeedsYouDismissals(
      state.needsYouDismissals,
      nextGlobalSessions,
    )

    set({
      needsYouDismissals: nextDismissals,
      globalSessions: nextGlobalSessions,
      globalChatSessions: nextGlobalChatSessions,
      sessions: nextSessions,
    })

    if (
      JSON.stringify(nextDismissals) !==
      JSON.stringify(state.needsYouDismissals)
    ) {
      void sessionApi.setNeedsYouDismissals(nextDismissals).catch((err) => {
        set({
          error:
            err instanceof Error
              ? err.message
              : 'Failed to persist needs-you dismissal state',
        })
      })
    }
  },

  handleConversationPatched: (event: ConversationPatchEvent) => {
    set((state) => {
      if (state.activeSessionId !== event.sessionId) {
        return state.activeGlobalSessionId === event.sessionId
          ? {
              activeGlobalConversation: upsertConversationItem(
                state.activeGlobalConversation,
                event.item,
              ),
              activeGlobalConversationSessionId: event.sessionId,
            }
          : {}
      }

      return {
        activeConversation: upsertConversationItem(
          state.activeConversation,
          event.item,
        ),
        activeConversationSessionId: event.sessionId,
      }
    })
  },

  handleQueuedInputPatched: (event: QueuedInputPatchEvent) => {
    set((state) => ({
      queuedInputsBySessionId: {
        ...state.queuedInputsBySessionId,
        [event.sessionId]: upsertQueuedInput(
          state.queuedInputsBySessionId[event.sessionId] ?? [],
          event.item,
        ),
      },
    }))
  },

  previewFork: (
    parentSessionId: string,
    requestId?: string,
    summarizeWith?: ForkSummarizeWith,
  ) => sessionForkApi.previewSummary(parentSessionId, requestId, summarizeWith),

  forkFull: async (input: ForkFullInput) => {
    const session = await sessionForkApi.forkFull(input)
    set((state) => ({
      sessions:
        state.currentProjectId === session.projectId
          ? [session, ...state.sessions]
          : state.sessions,
      globalSessions: [session, ...state.globalSessions],
      activeConversation: [],
      activeConversationSessionId: session.id,
      queuedInputsBySessionId: {
        ...state.queuedInputsBySessionId,
        [session.id]: [],
      },
      activeSessionId: session.id,
      activeProjectSessionId: session.id,
      draftWorkspaceId: null,
    }))
    get().recordRecentSession(session.id)
    void get().loadActiveConversation(session.id)
    return session
  },

  forkSummary: async (input: ForkSummaryInput) => {
    const session = await sessionForkApi.forkSummary(input)
    set((state) => ({
      sessions:
        state.currentProjectId === session.projectId
          ? [session, ...state.sessions]
          : state.sessions,
      globalSessions: [session, ...state.globalSessions],
      activeConversation: [],
      activeConversationSessionId: session.id,
      queuedInputsBySessionId: {
        ...state.queuedInputsBySessionId,
        [session.id]: [],
      },
      activeSessionId: session.id,
      activeProjectSessionId: session.id,
      draftWorkspaceId: null,
    }))
    get().recordRecentSession(session.id)
    void get().loadActiveConversation(session.id)
    return session
  },

  setPrimarySurface: async (id, surface) => {
    const updated = await sessionApi.setPrimarySurface(id, surface)
    // The backend also emits a session:summaryUpdated broadcast that will
    // eventually flow through handleSessionSummaryUpdate. Applying the
    // returned summary here too keeps the flip visible without waiting
    // for the round-trip.
    get().handleSessionSummaryUpdate(updated)
    return updated
  },

  /**
   * Moves a live session onto a different model or effort (MAR-2550).
   *
   * Nothing here is optimistic. The backend refuses the change unless the
   * session is idle, and a composer that had already redrawn itself would be
   * telling the human their next turn runs on a model it does not. The
   * returned summary — the row as it actually stands — is what redraws it.
   *
   * `input.providerId` is the provider the caller believes the session runs on.
   * The backend refuses when it disagrees with the row, so this field is the
   * renderer's half of a check it does not get to perform.
   */
  setSessionModelSelection: async (id, input) => {
    set({ error: null })
    try {
      const updated = await sessionApi.setModelSelection(id, input)
      get().handleSessionSummaryUpdate(updated)
      return updated
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      set({ error: error.message })
      throw error
    }
  },

  clearError: () => set({ error: null }),
}))

/**
 * This machine's providers, for every surface that has only ever meant this
 * machine (MAR-2682).
 *
 * Settings, analytics, session-start, the fork dialog and Mission Control all
 * describe the local registry and nothing else, so they read it by name here
 * rather than by taking whatever catalog happens to be first. A selector and
 * not a second field: one fact, one place it is written, and no way for the
 * two to disagree.
 *
 * The empty array is a module constant so zustand sees a stable reference and
 * does not re-render every subscriber on every unrelated store write.
 */
export function selectLocalProviders(state: SessionStore): ProviderInfo[] {
  const local = providerCatalogInForce(
    state.providerCatalogs,
    LOCAL_PROVIDER_CATALOG_SOURCE,
  )
  if (local?.status !== 'landed') return NO_PROVIDERS
  return descriptorsOf(local.providers)
}

const NO_PROVIDERS: ProviderInfo[] = []

/**
 * The descriptors of one catalog, the same array every time it is asked for.
 *
 * A zustand selector is called on every store write and its result compared by
 * identity, so a fresh `.map()` here would re-render every provider-reading
 * surface on every unrelated session update -- and a selector that returns a
 * new array each call is the classic way to spin the app (run 16 hit exactly
 * that shape in this codebase). Keyed on the entries array, which only changes
 * when a catalog actually lands, and weak so a catalog that is replaced takes
 * its cached projection with it.
 */
const descriptorCache = new WeakMap<
  readonly ProviderCatalogEntry[],
  ProviderInfo[]
>()

function descriptorsOf(entries: ProviderCatalogEntry[]): ProviderInfo[] {
  const cached = descriptorCache.get(entries)
  if (cached) return cached
  const descriptors = selectableProviderDescriptors(entries)
  descriptorCache.set(entries, descriptors)
  return descriptors
}
