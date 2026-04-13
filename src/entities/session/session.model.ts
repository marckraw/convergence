import { create } from 'zustand'
import type { Session, ProviderInfo, ReasoningEffort } from './session.types'
import { sessionApi, providerApi } from './session.api'

interface SessionState {
  sessions: Session[]
  globalSessions: Session[]
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
  deleteSession: (id: string, projectId: string) => Promise<void>
  prepareForProject: (projectId: string | null) => void
  beginSessionDraft: (workspaceId: string | null) => void
  setActiveSession: (id: string | null) => void
  handleSessionUpdate: (session: Session) => void
  clearError: () => void
}

export type SessionStore = SessionState & SessionActions

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  globalSessions: [],
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
    set({ globalSessions })
  },

  loadProviders: async () => {
    const providers = await providerApi.getAll()
    set({ providers })
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

  deleteSession: async (id: string, projectId: string) => {
    try {
      await sessionApi.delete(id)
      const sessions = await sessionApi.getByProjectId(projectId)
      const globalSessions = get().globalSessions.filter(
        (session) => session.id !== id,
      )
      const { activeSessionId } = get()
      set({
        sessions,
        globalSessions,
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
    set((state) => ({
      globalSessions: state.globalSessions.some((s) => s.id === session.id)
        ? state.globalSessions.map((s) => (s.id === session.id ? session : s))
        : [session, ...state.globalSessions],
      sessions: state.sessions.some((s) => s.id === session.id)
        ? state.sessions.map((s) => (s.id === session.id ? session : s))
        : currentProjectId && session.projectId === currentProjectId
          ? [session, ...state.sessions]
          : state.sessions,
    }))
  },

  clearError: () => set({ error: null }),
}))
