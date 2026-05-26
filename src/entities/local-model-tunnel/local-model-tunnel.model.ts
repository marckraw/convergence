import { create } from 'zustand'
import { localModelTunnelApi } from './local-model-tunnel.api'
import type {
  LocalModelTunnelProfileInput,
  LocalModelTunnelSnapshot,
} from './local-model-tunnel.types'

interface LocalModelTunnelStore {
  snapshot: LocalModelTunnelSnapshot | null
  isLoading: boolean
  isMutatingProfileId: string | null
  error: string | null
  load: () => Promise<void>
  ingest: (snapshot: LocalModelTunnelSnapshot) => void
  start: (profileId: string) => Promise<void>
  stop: (profileId: string) => Promise<void>
  restart: (profileId: string) => Promise<void>
  createProfile: (input: LocalModelTunnelProfileInput) => Promise<void>
  updateProfile: (
    profileId: string,
    input: LocalModelTunnelProfileInput,
  ) => Promise<void>
  deleteProfile: (profileId: string) => Promise<void>
  clearError: () => void
}

async function runSnapshotMutation(
  set: (
    patch: Partial<Pick<LocalModelTunnelStore, 'snapshot' | 'error'>>,
  ) => void,
  action: () => Promise<LocalModelTunnelSnapshot>,
): Promise<void> {
  try {
    set({ snapshot: await action(), error: null })
  } catch (error) {
    set({
      error:
        error instanceof Error
          ? error.message
          : 'Local model tunnel operation failed',
    })
  }
}

export const useLocalModelTunnelStore = create<LocalModelTunnelStore>(
  (set) => ({
    snapshot: null,
    isLoading: false,
    isMutatingProfileId: null,
    error: null,

    load: async () => {
      set({ isLoading: true, error: null })
      try {
        set({ snapshot: await localModelTunnelApi.getSnapshot() })
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load local model tunnels',
        })
      } finally {
        set({ isLoading: false })
      }
    },

    ingest: (snapshot) => set({ snapshot }),

    start: async (profileId) => {
      set({ isMutatingProfileId: profileId })
      await runSnapshotMutation(set, () => localModelTunnelApi.start(profileId))
      set({ isMutatingProfileId: null })
    },

    stop: async (profileId) => {
      set({ isMutatingProfileId: profileId })
      await runSnapshotMutation(set, () => localModelTunnelApi.stop(profileId))
      set({ isMutatingProfileId: null })
    },

    restart: async (profileId) => {
      set({ isMutatingProfileId: profileId })
      await runSnapshotMutation(set, () =>
        localModelTunnelApi.restart(profileId),
      )
      set({ isMutatingProfileId: null })
    },

    createProfile: async (input) => {
      set({ isMutatingProfileId: 'new' })
      await runSnapshotMutation(set, () =>
        localModelTunnelApi.createProfile(input),
      )
      set({ isMutatingProfileId: null })
    },

    updateProfile: async (profileId, input) => {
      set({ isMutatingProfileId: profileId })
      await runSnapshotMutation(set, () =>
        localModelTunnelApi.updateProfile(profileId, input),
      )
      set({ isMutatingProfileId: null })
    },

    deleteProfile: async (profileId) => {
      set({ isMutatingProfileId: profileId })
      await runSnapshotMutation(set, () =>
        localModelTunnelApi.deleteProfile(profileId),
      )
      set({ isMutatingProfileId: null })
    },

    clearError: () => set({ error: null }),
  }),
)
