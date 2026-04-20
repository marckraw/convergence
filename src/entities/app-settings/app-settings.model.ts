import { create } from 'zustand'
import { appSettingsApi } from './app-settings.api'
import type { AppSettings, AppSettingsInput } from './app-settings.types'

const EMPTY: AppSettings = {
  defaultProviderId: null,
  defaultModelId: null,
  defaultEffortId: null,
  namingModelByProvider: {},
  extractionModelByProvider: {},
}

interface AppSettingsState {
  settings: AppSettings
  isLoaded: boolean
  isSaving: boolean
  error: string | null
  unsubscribeBroadcast: (() => void) | null
}

interface AppSettingsActions {
  load: () => Promise<void>
  save: (input: AppSettingsInput) => Promise<AppSettings>
  clearError: () => void
}

export type AppSettingsStore = AppSettingsState & AppSettingsActions

export const useAppSettingsStore = create<AppSettingsStore>((set, get) => ({
  settings: EMPTY,
  isLoaded: false,
  isSaving: false,
  error: null,
  unsubscribeBroadcast: null,

  load: async () => {
    try {
      const settings = await appSettingsApi.get()

      const existing = get().unsubscribeBroadcast
      if (existing) existing()
      const unsubscribeBroadcast = appSettingsApi.onUpdated((updated) => {
        set({ settings: updated })
      })

      set({ settings, isLoaded: true, error: null, unsubscribeBroadcast })
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to load app settings',
      })
    }
  },

  save: async (input) => {
    set({ isSaving: true, error: null })
    try {
      const stored = await appSettingsApi.set(input)
      set({ settings: stored, isLoaded: true, isSaving: false })
      return stored
    } catch (err) {
      set({
        isSaving: false,
        error:
          err instanceof Error ? err.message : 'Failed to save app settings',
      })
      throw err
    }
  },

  clearError: () => set({ error: null }),
}))
