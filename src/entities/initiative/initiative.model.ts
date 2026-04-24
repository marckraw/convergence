import { create } from 'zustand'
import { initiativeApi } from './initiative.api'
import type {
  CreateInitiativeInput,
  CreateInitiativeOutputInput,
  Initiative,
  InitiativeAttempt,
  InitiativeOutput,
  InitiativeSynthesisResult,
  LinkInitiativeAttemptInput,
  UpdateInitiativeAttemptInput,
  UpdateInitiativeInput,
  UpdateInitiativeOutputInput,
} from './initiative.types'

interface InitiativeState {
  initiatives: Initiative[]
  attemptsByInitiativeId: Record<string, InitiativeAttempt[]>
  attemptsBySessionId: Record<string, InitiativeAttempt[]>
  outputsByInitiativeId: Record<string, InitiativeOutput[]>
  loading: boolean
  error: string | null
}

interface InitiativeActions {
  loadInitiatives: () => Promise<void>
  createInitiative: (input: CreateInitiativeInput) => Promise<Initiative | null>
  updateInitiative: (
    id: string,
    input: UpdateInitiativeInput,
  ) => Promise<Initiative | null>
  deleteInitiative: (id: string) => Promise<void>
  loadAttempts: (initiativeId: string) => Promise<void>
  loadAttemptsForSession: (sessionId: string) => Promise<void>
  linkAttempt: (
    input: LinkInitiativeAttemptInput,
  ) => Promise<InitiativeAttempt | null>
  updateAttempt: (
    id: string,
    initiativeId: string,
    input: UpdateInitiativeAttemptInput,
  ) => Promise<InitiativeAttempt | null>
  unlinkAttempt: (id: string, initiativeId: string) => Promise<void>
  setPrimaryAttempt: (
    initiativeId: string,
    attemptId: string,
  ) => Promise<InitiativeAttempt | null>
  loadOutputs: (initiativeId: string) => Promise<void>
  addOutput: (
    input: CreateInitiativeOutputInput,
  ) => Promise<InitiativeOutput | null>
  updateOutput: (
    id: string,
    initiativeId: string,
    input: UpdateInitiativeOutputInput,
  ) => Promise<InitiativeOutput | null>
  deleteOutput: (id: string, initiativeId: string) => Promise<void>
  synthesize: (
    initiativeId: string,
    requestId?: string,
  ) => Promise<InitiativeSynthesisResult | null>
  clearError: () => void
}

export type InitiativeStore = InitiativeState & InitiativeActions

function upsertInitiative(
  initiatives: Initiative[],
  next: Initiative,
): Initiative[] {
  return initiatives.some((initiative) => initiative.id === next.id)
    ? initiatives.map((initiative) =>
        initiative.id === next.id ? next : initiative,
      )
    : [next, ...initiatives]
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items]
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id)
}

export const useInitiativeStore = create<InitiativeStore>((set) => ({
  initiatives: [],
  attemptsByInitiativeId: {},
  attemptsBySessionId: {},
  outputsByInitiativeId: {},
  loading: false,
  error: null,

  loadInitiatives: async () => {
    set({ loading: true, error: null })
    try {
      const initiatives = await initiativeApi.list()
      set({ initiatives, loading: false })
    } catch (err) {
      set({
        loading: false,
        error:
          err instanceof Error ? err.message : 'Failed to load Initiatives',
      })
    }
  },

  createInitiative: async (input) => {
    set({ error: null })
    try {
      const initiative = await initiativeApi.create(input)
      set((state) => ({
        initiatives: upsertInitiative(state.initiatives, initiative),
      }))
      return initiative
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to create Initiative',
      })
      return null
    }
  },

  updateInitiative: async (id, input) => {
    set({ error: null })
    try {
      const initiative = await initiativeApi.update(id, input)
      set((state) => ({
        initiatives: upsertInitiative(state.initiatives, initiative),
      }))
      return initiative
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to update Initiative',
      })
      return null
    }
  },

  deleteInitiative: async (id) => {
    set({ error: null })
    try {
      await initiativeApi.delete(id)
      set((state) => {
        const attemptsByInitiativeId = { ...state.attemptsByInitiativeId }
        const attemptsBySessionId = { ...state.attemptsBySessionId }
        const outputsByInitiativeId = { ...state.outputsByInitiativeId }
        delete attemptsByInitiativeId[id]
        for (const [sessionId, attempts] of Object.entries(
          attemptsBySessionId,
        )) {
          attemptsBySessionId[sessionId] = attempts.filter(
            (attempt) => attempt.initiativeId !== id,
          )
        }
        delete outputsByInitiativeId[id]
        return {
          initiatives: removeById(state.initiatives, id),
          attemptsByInitiativeId,
          attemptsBySessionId,
          outputsByInitiativeId,
        }
      })
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to delete Initiative',
      })
    }
  },

  loadAttempts: async (initiativeId) => {
    set({ error: null })
    try {
      const attempts = await initiativeApi.listAttempts(initiativeId)
      set((state) => ({
        attemptsByInitiativeId: {
          ...state.attemptsByInitiativeId,
          [initiativeId]: attempts,
        },
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load Attempts',
      })
    }
  },

  loadAttemptsForSession: async (sessionId) => {
    set({ error: null })
    try {
      const attempts = await initiativeApi.listAttemptsForSession(sessionId)
      set((state) => ({
        attemptsBySessionId: {
          ...state.attemptsBySessionId,
          [sessionId]: attempts,
        },
      }))
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load session Attempts',
      })
    }
  },

  linkAttempt: async (input) => {
    set({ error: null })
    try {
      const attempt = await initiativeApi.linkAttempt(input)
      set((state) => ({
        attemptsByInitiativeId: {
          ...state.attemptsByInitiativeId,
          [input.initiativeId]: upsertById(
            state.attemptsByInitiativeId[input.initiativeId] ?? [],
            attempt,
          ),
        },
        attemptsBySessionId: {
          ...state.attemptsBySessionId,
          [input.sessionId]: upsertById(
            state.attemptsBySessionId[input.sessionId] ?? [],
            attempt,
          ),
        },
      }))
      return attempt
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to link Attempt',
      })
      return null
    }
  },

  updateAttempt: async (id, initiativeId, input) => {
    set({ error: null })
    try {
      const attempt = await initiativeApi.updateAttempt(id, input)
      set((state) => ({
        attemptsByInitiativeId: {
          ...state.attemptsByInitiativeId,
          [initiativeId]: upsertById(
            state.attemptsByInitiativeId[initiativeId] ?? [],
            attempt,
          ),
        },
        attemptsBySessionId: {
          ...state.attemptsBySessionId,
          [attempt.sessionId]: upsertById(
            state.attemptsBySessionId[attempt.sessionId] ?? [],
            attempt,
          ),
        },
      }))
      return attempt
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update Attempt',
      })
      return null
    }
  },

  unlinkAttempt: async (id, initiativeId) => {
    set({ error: null })
    try {
      await initiativeApi.unlinkAttempt(id)
      set((state) => ({
        attemptsByInitiativeId: {
          ...state.attemptsByInitiativeId,
          [initiativeId]: removeById(
            state.attemptsByInitiativeId[initiativeId] ?? [],
            id,
          ),
        },
        attemptsBySessionId: Object.fromEntries(
          Object.entries(state.attemptsBySessionId).map(
            ([sessionId, attempts]) => [sessionId, removeById(attempts, id)],
          ),
        ),
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to unlink Attempt',
      })
    }
  },

  setPrimaryAttempt: async (initiativeId, attemptId) => {
    set({ error: null })
    try {
      const attempt = await initiativeApi.setPrimaryAttempt(
        initiativeId,
        attemptId,
      )
      const attempts = await initiativeApi.listAttempts(initiativeId)
      set((state) => ({
        attemptsByInitiativeId: {
          ...state.attemptsByInitiativeId,
          [initiativeId]: attempts,
        },
        attemptsBySessionId: attempts.reduce(
          (nextBySession, nextAttempt) => ({
            ...nextBySession,
            [nextAttempt.sessionId]: upsertById(
              nextBySession[nextAttempt.sessionId] ?? [],
              nextAttempt,
            ),
          }),
          { ...state.attemptsBySessionId },
        ),
      }))
      return attempt
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to set primary Attempt',
      })
      return null
    }
  },

  loadOutputs: async (initiativeId) => {
    set({ error: null })
    try {
      const outputs = await initiativeApi.listOutputs(initiativeId)
      set((state) => ({
        outputsByInitiativeId: {
          ...state.outputsByInitiativeId,
          [initiativeId]: outputs,
        },
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load Outputs',
      })
    }
  },

  addOutput: async (input) => {
    set({ error: null })
    try {
      const output = await initiativeApi.addOutput(input)
      set((state) => ({
        outputsByInitiativeId: {
          ...state.outputsByInitiativeId,
          [input.initiativeId]: upsertById(
            state.outputsByInitiativeId[input.initiativeId] ?? [],
            output,
          ),
        },
      }))
      return output
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to add Output',
      })
      return null
    }
  },

  updateOutput: async (id, initiativeId, input) => {
    set({ error: null })
    try {
      const output = await initiativeApi.updateOutput(id, input)
      set((state) => ({
        outputsByInitiativeId: {
          ...state.outputsByInitiativeId,
          [initiativeId]: upsertById(
            state.outputsByInitiativeId[initiativeId] ?? [],
            output,
          ),
        },
      }))
      return output
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update Output',
      })
      return null
    }
  },

  deleteOutput: async (id, initiativeId) => {
    set({ error: null })
    try {
      await initiativeApi.deleteOutput(id)
      set((state) => ({
        outputsByInitiativeId: {
          ...state.outputsByInitiativeId,
          [initiativeId]: removeById(
            state.outputsByInitiativeId[initiativeId] ?? [],
            id,
          ),
        },
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete Output',
      })
    }
  },

  synthesize: async (initiativeId, requestId) => {
    set({ error: null })
    try {
      return await initiativeApi.synthesize(initiativeId, requestId)
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to synthesize Initiative',
      })
      return null
    }
  },

  clearError: () => set({ error: null }),
}))
