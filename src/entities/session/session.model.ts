import { create } from 'zustand'
import type { Session, ProviderInfo } from './session.types'
import { sessionApi, providerApi } from './session.api'

interface SessionState {
  sessions: Session[]
  activeSessionId: string | null
  providers: ProviderInfo[]
  error: string | null
}

interface SessionActions {
  loadSessions: (projectId: string) => Promise<void>
  loadProviders: () => Promise<void>
  createAndStartSession: (
    projectId: string,
    workspaceId: string | null,
    providerId: string,
    name: string,
    message: string,
  ) => Promise<void>
  approveSession: (id: string) => Promise<void>
  denySession: (id: string) => Promise<void>
  stopSession: (id: string) => Promise<void>
  deleteSession: (id: string, projectId: string) => Promise<void>
  setActiveSession: (id: string | null) => void
  handleSessionUpdate: (session: Session) => void
  clearError: () => void
}

export type SessionStore = SessionState & SessionActions

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  providers: [],
  error: null,

  loadSessions: async (projectId: string) => {
    const sessions = await sessionApi.getByProjectId(projectId)
    set({ sessions })
  },

  loadProviders: async () => {
    const providers = await providerApi.getAll()
    set({ providers })
  },

  createAndStartSession: async (
    projectId,
    workspaceId,
    providerId,
    name,
    message,
  ) => {
    set({ error: null })
    try {
      const session = await sessionApi.create({
        projectId,
        workspaceId,
        providerId,
        name,
      })
      await sessionApi.start(session.id, message)
      set((state) => ({
        sessions: [session, ...state.sessions],
        activeSessionId: session.id,
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
      const { activeSessionId } = get()
      set({
        sessions,
        activeSessionId: activeSessionId === id ? null : activeSessionId,
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete',
      })
    }
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  handleSessionUpdate: (session: Session) => {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === session.id ? session : s)),
    }))
  },

  clearError: () => set({ error: null }),
}))
