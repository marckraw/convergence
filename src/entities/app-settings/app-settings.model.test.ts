import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppSettingsStore } from './app-settings.model'
import {
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_ONBOARDING_PREFS,
  DEFAULT_UPDATE_PREFS,
  type AppSettings,
} from './app-settings.types'

const EMPTY: AppSettings = {
  defaultProviderId: null,
  defaultModelId: null,
  defaultEffortId: null,
  namingModelByProvider: {},
  extractionModelByProvider: {},
  notifications: DEFAULT_NOTIFICATION_PREFS,
  onboarding: DEFAULT_ONBOARDING_PREFS,
  updates: DEFAULT_UPDATE_PREFS,
}

type BroadcastCallback = (settings: AppSettings) => void

function installMockApi(
  overrides: {
    get?: ReturnType<typeof vi.fn>
    set?: ReturnType<typeof vi.fn>
    listeners?: BroadcastCallback[]
  } = {},
) {
  const listeners = overrides.listeners ?? []
  const mock = {
    appSettings: {
      get: overrides.get ?? vi.fn().mockResolvedValue(EMPTY),
      set: overrides.set ?? vi.fn(),
      onUpdated: vi.fn((cb: BroadcastCallback) => {
        listeners.push(cb)
        return () => {
          const idx = listeners.indexOf(cb)
          if (idx >= 0) listeners.splice(idx, 1)
        }
      }),
    },
  }
  Object.defineProperty(globalThis, 'window', {
    value: { electronAPI: mock },
    writable: true,
    configurable: true,
  })
  return { mock, listeners }
}

describe('useAppSettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppSettingsStore.getState().unsubscribeBroadcast?.()
    useAppSettingsStore.setState({
      settings: EMPTY,
      isLoaded: false,
      isSaving: false,
      error: null,
      unsubscribeBroadcast: null,
    })
  })

  it('loads settings from the preload bridge', async () => {
    const stored: AppSettings = {
      defaultProviderId: 'claude-code',
      defaultModelId: 'opus',
      defaultEffortId: 'high',
      namingModelByProvider: {},
      extractionModelByProvider: {},
      notifications: DEFAULT_NOTIFICATION_PREFS,
      onboarding: DEFAULT_ONBOARDING_PREFS,
      updates: DEFAULT_UPDATE_PREFS,
    }
    installMockApi({ get: vi.fn().mockResolvedValue(stored) })

    await useAppSettingsStore.getState().load()

    const state = useAppSettingsStore.getState()
    expect(state.settings).toEqual(stored)
    expect(state.isLoaded).toBe(true)
  })

  it('captures load errors into the store', async () => {
    installMockApi({ get: vi.fn().mockRejectedValue(new Error('boom')) })

    await useAppSettingsStore.getState().load()

    const state = useAppSettingsStore.getState()
    expect(state.error).toBe('boom')
    expect(state.isLoaded).toBe(false)
  })

  it('persists settings through save and reflects the returned value', async () => {
    const stored: AppSettings = {
      defaultProviderId: 'codex',
      defaultModelId: 'gpt-5.4',
      defaultEffortId: 'medium',
      namingModelByProvider: {},
      extractionModelByProvider: {},
      notifications: DEFAULT_NOTIFICATION_PREFS,
      onboarding: DEFAULT_ONBOARDING_PREFS,
      updates: DEFAULT_UPDATE_PREFS,
    }
    installMockApi({ set: vi.fn().mockResolvedValue(stored) })

    const result = await useAppSettingsStore.getState().save(stored)

    expect(result).toEqual(stored)
    expect(useAppSettingsStore.getState().settings).toEqual(stored)
    expect(useAppSettingsStore.getState().isSaving).toBe(false)
  })

  it('updates state when a broadcast arrives after load', async () => {
    const { listeners } = installMockApi()

    await useAppSettingsStore.getState().load()

    const updated: AppSettings = {
      defaultProviderId: 'codex',
      defaultModelId: 'gpt-5.4',
      defaultEffortId: 'high',
      namingModelByProvider: {},
      extractionModelByProvider: {},
      notifications: DEFAULT_NOTIFICATION_PREFS,
      onboarding: DEFAULT_ONBOARDING_PREFS,
      updates: DEFAULT_UPDATE_PREFS,
    }
    listeners.forEach((cb) => cb(updated))

    expect(useAppSettingsStore.getState().settings).toEqual(updated)
  })
})
