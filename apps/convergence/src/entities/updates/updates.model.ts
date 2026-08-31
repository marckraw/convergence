import { create } from 'zustand'
import { updatesApi } from './updates.api'
import {
  DEFAULT_UPDATE_PREFS,
  INITIAL_UPDATE_STATUS,
  type UpdatePrefs,
  type UpdateStatus,
} from './updates.types'

interface UpdatesState {
  status: UpdateStatus
  currentVersion: string | null
  isDev: boolean
  prefs: UpdatePrefs
  isLoaded: boolean
  lastTrigger: 'user' | 'background' | null
  error: string | null
  unsubscribe: (() => void) | null
}

interface UpdatesActions {
  loadInitial: () => Promise<void>
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  openReleaseNotes: () => Promise<void>
  setPrefs: (input: UpdatePrefs) => Promise<void>
  setLastTrigger: (trigger: 'user' | 'background' | null) => void
  clearError: () => void
}

export type UpdatesStore = UpdatesState & UpdatesActions

export const useUpdatesStore = create<UpdatesStore>((set, get) => ({
  status: INITIAL_UPDATE_STATUS,
  currentVersion: null,
  isDev: false,
  prefs: DEFAULT_UPDATE_PREFS,
  isLoaded: false,
  lastTrigger: null,
  error: null,
  unsubscribe: null,

  loadInitial: async () => {
    try {
      const [status, currentVersion, isDev, prefs] = await Promise.all([
        updatesApi.getStatus(),
        updatesApi.getAppVersion(),
        updatesApi.getIsDev(),
        updatesApi.getPrefs(),
      ])
      const existing = get().unsubscribe
      if (existing) existing()
      const unsubscribe = updatesApi.onStatusChanged((next) => {
        set({ status: next })
      })
      set({
        status,
        currentVersion,
        isDev,
        prefs,
        isLoaded: true,
        error: null,
        unsubscribe,
      })
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to load update state',
      })
    }
  },

  check: async () => {
    set({ lastTrigger: 'user', error: null })
    try {
      const status = await updatesApi.check()
      set({ status })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Check failed',
      })
    }
  },

  download: async () => {
    set({ error: null })
    try {
      const status = await updatesApi.download()
      set({ status })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Download failed',
      })
    }
  },

  install: async () => {
    set({ error: null })
    try {
      await updatesApi.install()
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Install failed',
      })
    }
  },

  openReleaseNotes: async () => {
    try {
      await updatesApi.openReleaseNotes()
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Could not open release notes',
      })
    }
  },

  setPrefs: async (input) => {
    try {
      const stored = await updatesApi.setPrefs(input)
      set({ prefs: stored })
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Could not save update prefs',
      })
    }
  },

  setLastTrigger: (trigger) => set({ lastTrigger: trigger }),
  clearError: () => set({ error: null }),
}))
