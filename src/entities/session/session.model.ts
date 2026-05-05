import { create } from 'zustand'
import type {
  ConversationItem,
  ConversationPatchEvent,
  MidRunInputMode,
  ProviderInfo,
  QueuedInputPatchEvent,
  ReasoningEffort,
  NeedsYouDismissals,
  NeedsYouDisposition,
  SessionQueuedInput,
  SessionSummary,
} from './session.types'
import type { SkillSelection } from '@/shared/types/skill.types'
import { isConversationalProvider } from './session.types'
import { sessionApi, providerApi } from './session.api'
import { sessionForkApi } from './session-fork.api'
import type {
  ForkFullInput,
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
  providers: ProviderInfo[]
  error: string | null
}

interface SessionActions {
  loadSessions: (projectId: string) => Promise<void>
  loadGlobalSessions: () => Promise<void>
  loadGlobalChatSessions: () => Promise<void>
  loadRecents: () => Promise<void>
  recordRecentSession: (id: string) => void
  loadProviders: () => Promise<void>
  dismissNeedsYouSession: (id: string) => Promise<void>
  createAndStartSession: (
    projectId: string,
    workspaceId: string | null,
    providerId: string,
    model: string | null,
    effort: ReasoningEffort | null,
    name: string,
    message: string,
    attachmentIds?: string[],
    skillSelections?: SkillSelection[],
    contextItemIds?: string[],
  ) => Promise<void>
  createAndStartGlobalSession: (
    providerId: string,
    model: string | null,
    effort: ReasoningEffort | null,
    name: string,
    message: string,
    attachmentIds?: string[],
    skillSelections?: SkillSelection[],
  ) => Promise<SessionSummary | null>
  createTerminalSession: (
    projectId: string,
    workspaceId: string | null,
    name: string,
  ) => Promise<SessionSummary>
  approveSession: (id: string) => Promise<void>
  denySession: (id: string) => Promise<void>
  sendMessageToSession: (
    id: string,
    text: string,
    attachmentIds?: string[],
    skillSelections?: SkillSelection[],
    deliveryMode?: MidRunInputMode,
  ) => Promise<void>
  stopSession: (id: string) => Promise<void>
  archiveSession: (id: string) => Promise<void>
  unarchiveSession: (id: string) => Promise<void>
  deleteSession: (id: string, projectId: string) => Promise<void>
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
  ) => Promise<ForkSummary>
  forkFull: (input: ForkFullInput) => Promise<SessionSummary>
  forkSummary: (input: ForkSummaryInput) => Promise<SessionSummary>
  setPrimarySurface: (
    id: string,
    surface: 'conversation' | 'terminal',
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
  providers: [],
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

  loadProviders: async () => {
    const providers = await providerApi.getAll()
    // Conversation surfaces (composer, session-start) only ever pick a real
    // chat provider; the synthetic shell provider is selected implicitly by
    // the terminal-session-create flow.
    set({ providers: providers.filter(isConversationalProvider) })
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

  createAndStartSession: async (
    projectId,
    workspaceId,
    providerId,
    model,
    effort,
    name,
    message,
    attachmentIds,
    skillSelections,
    contextItemIds,
  ) => {
    set({ error: null })
    try {
      const session = await sessionApi.create({
        projectId,
        workspaceId,
        providerId,
        model,
        effort,
        name,
      })
      await sessionApi.start(
        session.id,
        message,
        attachmentIds,
        skillSelections,
        contextItemIds,
      )
      set((state) => ({
        currentProjectId: projectId,
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

  createAndStartGlobalSession: async (
    providerId,
    model,
    effort,
    name,
    message,
    attachmentIds,
    skillSelections,
  ) => {
    set({ error: null })
    try {
      const session = await sessionApi.create({
        contextKind: 'global',
        providerId,
        model,
        effort,
        name,
      })
      await sessionApi.start(
        session.id,
        message,
        attachmentIds,
        skillSelections,
      )
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

  approveSession: async (id: string) => {
    set({ error: null })
    try {
      await sessionApi.approve(id)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to approve',
      })
    }
  },

  denySession: async (id: string) => {
    set({ error: null })
    try {
      await sessionApi.deny(id)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to deny',
      })
    }
  },

  sendMessageToSession: async (
    id: string,
    text: string,
    attachmentIds?: string[],
    skillSelections?: SkillSelection[],
    deliveryMode?: MidRunInputMode,
  ) => {
    set({ error: null })
    try {
      await sessionApi.sendMessage(
        id,
        text,
        attachmentIds,
        skillSelections,
        deliveryMode,
      )
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to send message',
      })
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

  deleteSession: async (id: string, projectId: string) => {
    try {
      await sessionApi.delete(id)
      const sessions = await sessionApi.getSummariesByProjectId(projectId)
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

  previewFork: (parentSessionId: string, requestId?: string) =>
    sessionForkApi.previewSummary(parentSessionId, requestId),

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

  clearError: () => set({ error: null }),
}))
