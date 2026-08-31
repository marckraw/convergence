import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdatesStore } from './updates.model'
import {
  DEFAULT_UPDATE_PREFS,
  INITIAL_UPDATE_STATUS,
  type UpdatePrefs,
  type UpdateStatus,
} from './updates.types'

interface MockApi {
  getStatus: ReturnType<typeof vi.fn>
  getAppVersion: ReturnType<typeof vi.fn>
  getIsDev: ReturnType<typeof vi.fn>
  getPrefs: ReturnType<typeof vi.fn>
  setPrefs: ReturnType<typeof vi.fn>
  check: ReturnType<typeof vi.fn>
  download: ReturnType<typeof vi.fn>
  install: ReturnType<typeof vi.fn>
  openReleaseNotes: ReturnType<typeof vi.fn>
  onStatusChanged: ReturnType<typeof vi.fn>
}

function installApi(
  overrides: Partial<MockApi> = {},
  listeners: ((status: UpdateStatus) => void)[] = [],
): MockApi {
  const api: MockApi = {
    getStatus:
      overrides.getStatus ?? vi.fn().mockResolvedValue(INITIAL_UPDATE_STATUS),
    getAppVersion:
      overrides.getAppVersion ?? vi.fn().mockResolvedValue('0.16.0'),
    getIsDev: overrides.getIsDev ?? vi.fn().mockResolvedValue(false),
    getPrefs:
      overrides.getPrefs ?? vi.fn().mockResolvedValue(DEFAULT_UPDATE_PREFS),
    setPrefs: overrides.setPrefs ?? vi.fn().mockImplementation(async (p) => p),
    check: overrides.check ?? vi.fn().mockResolvedValue(INITIAL_UPDATE_STATUS),
    download:
      overrides.download ?? vi.fn().mockResolvedValue(INITIAL_UPDATE_STATUS),
    install:
      overrides.install ?? vi.fn().mockResolvedValue(INITIAL_UPDATE_STATUS),
    openReleaseNotes:
      overrides.openReleaseNotes ?? vi.fn().mockResolvedValue(true),
    onStatusChanged:
      overrides.onStatusChanged ??
      vi.fn((cb: (status: UpdateStatus) => void) => {
        listeners.push(cb)
        return () => {
          const i = listeners.indexOf(cb)
          if (i >= 0) listeners.splice(i, 1)
        }
      }),
  }
  ;(window as unknown as { electronAPI: { updates: MockApi } }).electronAPI = {
    updates: api,
  }
  return api
}

function resetStore() {
  useUpdatesStore.getState().unsubscribe?.()
  useUpdatesStore.setState({
    status: INITIAL_UPDATE_STATUS,
    currentVersion: null,
    isDev: false,
    prefs: DEFAULT_UPDATE_PREFS,
    isLoaded: false,
    lastTrigger: null,
    error: null,
    unsubscribe: null,
  })
}

describe('useUpdatesStore', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  it('loadInitial hydrates status/version/prefs and subscribes', async () => {
    const status: UpdateStatus = {
      phase: 'not-available',
      currentVersion: '0.16.0',
      lastChecked: '2026-04-22T17:00:00.000Z',
    }
    const listeners: ((status: UpdateStatus) => void)[] = []
    installApi(
      {
        getStatus: vi.fn().mockResolvedValue(status),
        getAppVersion: vi.fn().mockResolvedValue('0.16.0'),
        getPrefs: vi.fn().mockResolvedValue({ backgroundCheckEnabled: false }),
      },
      listeners,
    )
    await useUpdatesStore.getState().loadInitial()
    const state = useUpdatesStore.getState()
    expect(state.status).toEqual(status)
    expect(state.currentVersion).toBe('0.16.0')
    expect(state.prefs).toEqual({ backgroundCheckEnabled: false })
    expect(state.isLoaded).toBe(true)
    expect(listeners).toHaveLength(1)
  })

  it('broadcasts from main replace the status in the store', async () => {
    const listeners: ((status: UpdateStatus) => void)[] = []
    installApi({}, listeners)
    await useUpdatesStore.getState().loadInitial()
    const next: UpdateStatus = {
      phase: 'available',
      version: '0.17.0',
      releaseNotesUrl: 'https://example.test/v0.17.0',
      detectedAt: '2026-04-22T17:05:00.000Z',
    }
    listeners[0](next)
    expect(useUpdatesStore.getState().status).toEqual(next)
  })

  it('check() records user trigger and updates status from resolved IPC', async () => {
    const checkingStatus: UpdateStatus = {
      phase: 'checking',
      startedAt: '2026-04-22T17:00:00.000Z',
    }
    installApi({ check: vi.fn().mockResolvedValue(checkingStatus) })
    await useUpdatesStore.getState().check()
    const state = useUpdatesStore.getState()
    expect(state.lastTrigger).toBe('user')
    expect(state.status).toEqual(checkingStatus)
    expect(state.error).toBeNull()
  })

  it('check() captures IPC error into the store without throwing', async () => {
    installApi({ check: vi.fn().mockRejectedValue(new Error('dev disabled')) })
    await useUpdatesStore.getState().check()
    expect(useUpdatesStore.getState().error).toBe('dev disabled')
  })

  it('setPrefs persists through API and updates store on success', async () => {
    const saved: UpdatePrefs = { backgroundCheckEnabled: false }
    const setPrefs = vi.fn().mockResolvedValue(saved)
    installApi({ setPrefs })
    await useUpdatesStore.getState().setPrefs(saved)
    expect(setPrefs).toHaveBeenCalledWith(saved)
    expect(useUpdatesStore.getState().prefs).toEqual(saved)
  })

  it('loadInitial unsubscribes previous listener on re-load', async () => {
    const listeners: ((status: UpdateStatus) => void)[] = []
    installApi({}, listeners)
    await useUpdatesStore.getState().loadInitial()
    expect(listeners).toHaveLength(1)
    await useUpdatesStore.getState().loadInitial()
    expect(listeners).toHaveLength(1)
  })
})
