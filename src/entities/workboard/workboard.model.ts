import { create } from 'zustand'
import { workboardApi } from './workboard.api'
import type {
  StartWorkboardRunInput,
  WorkboardSnapshot,
} from './workboard.types'

interface WorkboardState {
  snapshot: WorkboardSnapshot | null
  loading: boolean
  operation: 'loading' | 'syncing' | 'starting-run' | 'stopping-run' | null
  error: string | null
  statusMessage: string | null
}

interface WorkboardActions {
  loadSnapshot: () => Promise<void>
  syncSources: () => Promise<void>
  startRun: (input: StartWorkboardRunInput) => Promise<void>
  stopRun: (runId: string) => Promise<void>
  applySnapshot: (snapshot: WorkboardSnapshot) => void
  clearError: () => void
}

export type WorkboardStore = WorkboardState & WorkboardActions

export const useWorkboardStore = create<WorkboardStore>((set) => ({
  snapshot: null,
  loading: false,
  operation: null,
  error: null,
  statusMessage: null,

  loadSnapshot: async () => {
    set({ loading: true, operation: 'loading', error: null })
    try {
      const snapshot = await workboardApi.getSnapshot()
      set({ snapshot, loading: false, operation: null })
    } catch (err) {
      set({
        loading: false,
        operation: null,
        error:
          err instanceof Error ? err.message : 'Failed to load Agent Workboard',
      })
    }
  },

  syncSources: async () => {
    set({
      loading: true,
      operation: 'syncing',
      error: null,
      statusMessage: 'Syncing tracker sources...',
    })
    try {
      const snapshot = await workboardApi.syncSources()
      const sourceCount = snapshot.trackerSources.length
      const candidateCount = snapshot.candidates.length
      set({
        snapshot,
        loading: false,
        operation: null,
        statusMessage: `Synced ${sourceCount} tracker source${sourceCount === 1 ? '' : 's'} and found ${candidateCount} Workboard candidate${candidateCount === 1 ? '' : 's'}.`,
      })
    } catch (err) {
      set({
        loading: false,
        operation: null,
        statusMessage: null,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to sync Workboard sources',
      })
    }
  },

  startRun: async (input) => {
    set({ loading: true, operation: 'starting-run', error: null })
    try {
      const result = await workboardApi.startRun(input)
      set({
        snapshot: result.snapshot,
        loading: false,
        operation: null,
        statusMessage: 'Sandcastle run started.',
      })
    } catch (err) {
      set({
        loading: false,
        operation: null,
        error:
          err instanceof Error ? err.message : 'Failed to start Sandcastle run',
      })
    }
  },

  stopRun: async (runId) => {
    set({ loading: true, operation: 'stopping-run', error: null })
    try {
      const snapshot = await workboardApi.stopRun(runId)
      set({
        snapshot,
        loading: false,
        operation: null,
        statusMessage: 'Stop requested for Sandcastle run.',
      })
    } catch (err) {
      set({
        loading: false,
        operation: null,
        error:
          err instanceof Error ? err.message : 'Failed to stop Sandcastle run',
      })
    }
  },

  applySnapshot: (snapshot) => set({ snapshot, error: null }),

  clearError: () => set({ error: null, statusMessage: null }),
}))
