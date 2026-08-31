import { create } from 'zustand'
import type { ProviderStatusInfo } from '@/entities/session'
import { providerUpdatesApi } from './provider-updates.api'
import type {
  ProviderUpdateActionResult,
  ProviderUpdateSnapshot,
  ProviderUpdateTrigger,
} from './provider-updates.types'

const BACKGROUND_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

interface ProviderUpdatesState extends ProviderUpdateSnapshot {
  isLoaded: boolean
  isChecking: boolean
  lastTrigger: ProviderUpdateTrigger | null
  updatingProviderId: string | null
  lastResult: ProviderUpdateActionResult | null
  error: string | null
  unsubscribe: (() => void) | null
  intervalId: ReturnType<typeof setInterval> | null
}

interface ProviderUpdatesActions {
  loadInitial: () => Promise<void>
  check: (trigger?: ProviderUpdateTrigger) => Promise<void>
  updateProvider: (providerId: string) => Promise<void>
  updateAllOutdated: () => Promise<void>
  clearResult: () => void
  clearError: () => void
  stopBackgroundChecks: () => void
}

export type ProviderUpdatesStore = ProviderUpdatesState & ProviderUpdatesActions

export const useProviderUpdatesStore = create<ProviderUpdatesStore>(
  (set, get) => ({
    statuses: [],
    checkedAt: null,
    isLoaded: false,
    isChecking: false,
    lastTrigger: null,
    updatingProviderId: null,
    lastResult: null,
    error: null,
    unsubscribe: null,
    intervalId: null,

    loadInitial: async () => {
      const existing = get().unsubscribe
      if (existing) existing()

      const unsubscribe = providerUpdatesApi.onStatusesChanged((statuses) => {
        set({
          statuses,
          checkedAt: new Date().toISOString(),
          isLoaded: true,
        })
      })

      set({ unsubscribe })
      await get().check('background')

      if (!get().intervalId) {
        const intervalId = setInterval(() => {
          void get().check('background')
        }, BACKGROUND_CHECK_INTERVAL_MS)
        set({ intervalId })
      }
    },

    check: async (trigger = 'user') => {
      set({ isChecking: true, lastTrigger: trigger, error: null })
      try {
        const statuses = await providerUpdatesApi.getStatuses()
        set({
          statuses,
          checkedAt: new Date().toISOString(),
          isLoaded: true,
          error: null,
        })
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : 'Failed to check provider updates',
        })
      } finally {
        set({ isChecking: false })
      }
    },

    updateProvider: async (providerId) => {
      const provider = get().statuses.find((item) => item.id === providerId)
      set({
        updatingProviderId: providerId,
        lastResult: null,
        error: null,
      })

      try {
        const result = await providerUpdatesApi.update(providerId)
        const actionResult: ProviderUpdateActionResult = {
          providerId,
          providerName: provider?.name ?? providerId,
          ok: result.ok,
          error: result.error,
        }
        set({ lastResult: actionResult })

        if (!result.ok) {
          set({ error: result.error ?? 'Provider update failed' })
          return
        }

        await get().check('background')
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Provider update failed'
        set({
          error: message,
          lastResult: {
            providerId,
            providerName: provider?.name ?? providerId,
            ok: false,
            error: message,
          },
        })
      } finally {
        set({ updatingProviderId: null })
      }
    },

    updateAllOutdated: async () => {
      const candidates = get()
        .statuses.filter(isAutomaticallyUpdatable)
        .map((provider) => provider.id)

      for (const providerId of candidates) {
        await get().updateProvider(providerId)
        if (get().lastResult?.ok === false) return
      }
    },

    clearResult: () => set({ lastResult: null }),
    clearError: () => set({ error: null }),
    stopBackgroundChecks: () => {
      const { intervalId, unsubscribe } = get()
      if (intervalId) clearInterval(intervalId)
      if (unsubscribe) unsubscribe()
      set({ intervalId: null, unsubscribe: null })
    },
  }),
)

export function isAutomaticallyUpdatable(
  provider: ProviderStatusInfo,
): boolean {
  return (
    provider.availability === 'available' &&
    provider.update.status === 'outdated' &&
    provider.update.updateCapability === 'automatic'
  )
}
