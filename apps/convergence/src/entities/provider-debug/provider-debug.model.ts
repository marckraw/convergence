import { create } from 'zustand'
import { appendBoundedEntries } from './provider-debug.pure'
import type { ProviderDebugEntry } from './provider-debug.types'

interface ProviderDebugState {
  bySession: Record<string, ProviderDebugEntry[]>
}

interface ProviderDebugActions {
  ingest: (entry: ProviderDebugEntry) => void
  hydrate: (sessionId: string, entries: ProviderDebugEntry[]) => void
  drop: (sessionId: string) => void
  reset: () => void
}

export type ProviderDebugStore = ProviderDebugState & ProviderDebugActions

export const useProviderDebugStore = create<ProviderDebugStore>((set) => ({
  bySession: {},

  ingest: (entry) => {
    set((state) => {
      const prev = state.bySession[entry.sessionId] ?? []
      return {
        bySession: {
          ...state.bySession,
          [entry.sessionId]: appendBoundedEntries(prev, entry),
        },
      }
    })
  },

  hydrate: (sessionId, entries) => {
    set((state) => ({
      bySession: { ...state.bySession, [sessionId]: entries.slice() },
    }))
  },

  drop: (sessionId) => {
    set((state) => {
      if (!(sessionId in state.bySession)) return state
      const next = { ...state.bySession }
      delete next[sessionId]
      return { bySession: next }
    })
  },

  reset: () => set({ bySession: {} }),
}))
