import { create } from 'zustand'
import { analyticsApi } from './analytics.api'
import type {
  AnalyticsOverview,
  AnalyticsRangePreset,
  GenerateWorkProfileInput,
} from './analytics.types'

interface AnalyticsState {
  rangePreset: AnalyticsRangePreset
  overview: AnalyticsOverview | null
  isLoading: boolean
  isGeneratingProfile: boolean
  error: string | null
}

interface AnalyticsActions {
  loadOverview: (rangePreset?: AnalyticsRangePreset) => Promise<void>
  generateWorkProfile: (input: GenerateWorkProfileInput) => Promise<void>
  deleteWorkProfileSnapshot: (id: string) => Promise<void>
  setRangePreset: (rangePreset: AnalyticsRangePreset) => void
  clearError: () => void
}

export type AnalyticsStore = AnalyticsState & AnalyticsActions

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => ({
  rangePreset: '30d',
  overview: null,
  isLoading: false,
  isGeneratingProfile: false,
  error: null,

  loadOverview: async (rangePreset = get().rangePreset) => {
    set({ rangePreset, isLoading: true, error: null })
    try {
      const overview = await analyticsApi.getOverview(rangePreset)
      set({ overview, rangePreset, isLoading: false })
    } catch (err) {
      set({
        isLoading: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load analytics overview',
      })
    }
  },

  generateWorkProfile: async (input) => {
    set({ isGeneratingProfile: true, error: null })
    try {
      const snapshot = await analyticsApi.generateWorkProfile(input)
      set((state) => ({
        isGeneratingProfile: false,
        overview: state.overview
          ? { ...state.overview, generatedProfile: snapshot }
          : state.overview,
      }))
    } catch (err) {
      set({
        isGeneratingProfile: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to generate work profile',
      })
    }
  },

  deleteWorkProfileSnapshot: async (id) => {
    set({ error: null })
    try {
      await analyticsApi.deleteWorkProfileSnapshot(id)
      set((state) => ({
        overview:
          state.overview?.generatedProfile?.id === id
            ? { ...state.overview, generatedProfile: null }
            : state.overview,
      }))
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to delete work profile',
      })
    }
  },

  setRangePreset: (rangePreset) => set({ rangePreset }),

  clearError: () => set({ error: null }),
}))
