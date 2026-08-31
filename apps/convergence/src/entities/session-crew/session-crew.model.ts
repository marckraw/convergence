import { create } from 'zustand'
import { sessionCrewApi } from './session-crew.api'
import type {
  CreateSessionCrewInput,
  SessionCrew,
  UpdateSessionCrewInput,
} from './session-crew.types'

interface SessionCrewState {
  crews: SessionCrew[]
  isLoaded: boolean
  error: string | null
  unsubscribeBroadcast: (() => void) | null
}

interface SessionCrewActions {
  load: () => Promise<void>
  createCrew: (input: CreateSessionCrewInput) => Promise<SessionCrew | null>
  updateCrew: (
    id: string,
    patch: UpdateSessionCrewInput,
  ) => Promise<SessionCrew | null>
  deleteCrew: (id: string) => Promise<void>
  addMember: (crewId: string, sessionId: string) => Promise<SessionCrew | null>
  removeMember: (
    crewId: string,
    sessionId: string,
  ) => Promise<SessionCrew | null>
  clearError: () => void
}

export type SessionCrewStore = SessionCrewState & SessionCrewActions

const EMPTY_CREWS: SessionCrew[] = []

export function selectCrewsForSession(
  state: Pick<SessionCrewState, 'crews'>,
  sessionId: string | null | undefined,
): SessionCrew[] {
  if (!sessionId) return EMPTY_CREWS
  return state.crews.filter((crew) => crew.sessionIds.includes(sessionId))
}

function sortCrews(crews: SessionCrew[]): SessionCrew[] {
  return [...crews].sort(
    (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt),
  )
}

function upsertCrew(crews: SessionCrew[], next: SessionCrew): SessionCrew[] {
  const replaced = crews.some((crew) => crew.id === next.id)
    ? crews.map((crew) => (crew.id === next.id ? next : crew))
    : [...crews, next]
  return sortCrews(replaced)
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export const useSessionCrewStore = create<SessionCrewStore>((set, get) => ({
  crews: EMPTY_CREWS,
  isLoaded: false,
  error: null,
  unsubscribeBroadcast: null,

  load: async () => {
    try {
      const crews = await sessionCrewApi.list()

      // Every mutation in any window rebroadcasts the whole roster, so a
      // single subscription keeps this window honest without polling.
      const existing = get().unsubscribeBroadcast
      if (existing) existing()
      const unsubscribeBroadcast = sessionCrewApi.onUpdated((updated) => {
        set({ crews: sortCrews(updated) })
      })

      set({
        crews: sortCrews(crews),
        isLoaded: true,
        error: null,
        unsubscribeBroadcast,
      })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to load crews') })
    }
  },

  createCrew: async (input) => {
    try {
      const crew = await sessionCrewApi.create(input)
      set({ crews: upsertCrew(get().crews, crew), error: null })
      return crew
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to create crew') })
      return null
    }
  },

  updateCrew: async (id, patch) => {
    try {
      const crew = await sessionCrewApi.update(id, patch)
      set({ crews: upsertCrew(get().crews, crew), error: null })
      return crew
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to update crew') })
      return null
    }
  },

  deleteCrew: async (id) => {
    try {
      await sessionCrewApi.delete(id)
      set({
        crews: get().crews.filter((crew) => crew.id !== id),
        error: null,
      })
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to delete crew') })
    }
  },

  addMember: async (crewId, sessionId) => {
    try {
      const crew = await sessionCrewApi.addMember(crewId, sessionId)
      set({ crews: upsertCrew(get().crews, crew), error: null })
      return crew
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to add session to crew') })
      return null
    }
  },

  removeMember: async (crewId, sessionId) => {
    try {
      const crew = await sessionCrewApi.removeMember(crewId, sessionId)
      set({ crews: upsertCrew(get().crews, crew), error: null })
      return crew
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to remove session from crew') })
      return null
    }
  },

  clearError: () => set({ error: null }),
}))
