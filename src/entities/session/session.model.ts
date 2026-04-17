import { create } from 'zustand'
import type {
  Session,
  ProviderInfo,
  ReasoningEffort,
  NeedsYouDismissals,
  NeedsYouDisposition,
} from './session.types'
import { sessionApi, providerApi } from './session.api'

interface SessionState {
  sessions: Session[]
  globalSessions: Session[]
  needsYouDismissals: NeedsYouDismissals
  currentProjectId: string | null
  activeSessionId: string | null
  draftWorkspaceId: string | null
  providers: ProviderInfo[]
  error: string | null
}

interface SessionActions {
  loadSessions: (projectId: string) => Promise<void>
  loadGlobalSessions: () => Promise<void>
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
  ) => Promise<void>
  approveSession: (id: string) => Promise<void>
  denySession: (id: string) => Promise<void>
  sendMessageToSession: (id: string, text: string) => Promise<void>
  stopSession: (id: string) => Promise<void>
  archiveSession: (id: string) => Promise<void>
  unarchiveSession: (id: string) => Promise<void>
  deleteSession: (id: string, projectId: string) => Promise<void>
  prepareForProject: (projectId: string | null) => void
  beginSessionDraft: (workspaceId: string | null) => void
  setActiveSession: (id: string | null) => void
  handleSessionUpdate: (session: Session) => void
  clearError: () => void
}

export type SessionStore = SessionState & SessionActions

function resolveNeedsYouDisposition(
  session: Session,
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
  sessions: Session[],
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

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  globalSessions: [],
  needsYouDismissals: {},
  currentProjectId: null,
  activeSessionId: null,
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
        draftWorkspaceId: null,
      })
    }

    const sessions = await sessionApi.getByProjectId(projectId)
    set((state) => ({
      currentProjectId: projectId,
      sessions,
      activeSessionId: sessions.some(
        (session) => session.id === state.activeSessionId,
      )
        ? state.activeSessionId
        : null,
      draftWorkspaceId: sessions.some(
        (session) => session.id === state.activeSessionId,
      )
        ? state.draftWorkspaceId
        : null,
    }))
  },

  loadGlobalSessions: async () => {
    const globalSessions = await sessionApi.getAll()
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

  loadProviders: async () => {
    const providers = await providerApi.getAll()
    set({ providers })
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
      await sessionApi.start(session.id, message)
      set((state) => ({
        currentProjectId: projectId,
        sessions: [session, ...state.sessions],
        globalSessions: [session, ...state.globalSessions],
        needsYouDismissals: Object.fromEntries(
          Object.entries(state.needsYouDismissals).filter(
            ([sessionId]) => sessionId !== session.id,
          ),
        ),
        activeSessionId: session.id,
        draftWorkspaceId: null,
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to start session',
      })
    }
  },

  approveSession: async (id: string) => {
    try {
      await sessionApi.approve(id)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to approve',
      })
    }
  },

  denySession: async (id: string) => {
    try {
      await sessionApi.deny(id)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to deny',
      })
    }
  },

  sendMessageToSession: async (id: string, text: string) => {
    set({ error: null })
    try {
      await sessionApi.sendMessage(id, text)
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
      const sessions = await sessionApi.getByProjectId(projectId)
      const globalSessions = get().globalSessions.filter(
        (session) => session.id !== id,
      )
      const { activeSessionId } = get()
      const nextDismissals = removeNeedsYouDismissal(
        get().needsYouDismissals,
        id,
      )
      await sessionApi.setNeedsYouDismissals(nextDismissals)
      set({
        sessions,
        globalSessions,
        needsYouDismissals: nextDismissals,
        activeSessionId: activeSessionId === id ? null : activeSessionId,
        draftWorkspaceId:
          activeSessionId === id ? null : get().draftWorkspaceId,
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete',
      })
    }
  },

  prepareForProject: (projectId) =>
    set({
      currentProjectId: projectId,
      sessions: [],
      activeSessionId: null,
      draftWorkspaceId: null,
    }),

  beginSessionDraft: (workspaceId) =>
    set({
      activeSessionId: null,
      draftWorkspaceId: workspaceId,
    }),

  setActiveSession: (id) =>
    set({
      activeSessionId: id,
      draftWorkspaceId: null,
    }),

  handleSessionUpdate: (session: Session) => {
    const currentProjectId = get().currentProjectId
    const state = get()
    const nextGlobalSessions = state.globalSessions.some(
      (s) => s.id === session.id,
    )
      ? state.globalSessions.map((s) => (s.id === session.id ? session : s))
      : [session, ...state.globalSessions]
    const nextSessions = state.sessions.some((s) => s.id === session.id)
      ? state.sessions.map((s) => (s.id === session.id ? session : s))
      : currentProjectId && session.projectId === currentProjectId
        ? [session, ...state.sessions]
        : state.sessions
    const nextDismissals = pruneNeedsYouDismissals(
      state.needsYouDismissals,
      nextGlobalSessions,
    )

    set({
      needsYouDismissals: nextDismissals,
      globalSessions: nextGlobalSessions,
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

  clearError: () => set({ error: null }),
}))
