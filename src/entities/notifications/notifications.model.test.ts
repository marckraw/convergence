import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PULSE_DURATION_MS, useNotificationsStore } from './notifications.model'
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from './notifications.types'

function installApiMocks(
  overrides: {
    getPrefs?: () => Promise<NotificationPrefs>
    setPrefs?: (input: NotificationPrefs) => Promise<NotificationPrefs>
    onPrefsUpdated?: (cb: (prefs: NotificationPrefs) => void) => () => void
    setActiveSession?: (sessionId: string | null) => Promise<void>
  } = {},
) {
  const api = {
    getPrefs:
      overrides.getPrefs ??
      vi.fn().mockResolvedValue(DEFAULT_NOTIFICATION_PREFS),
    setPrefs:
      overrides.setPrefs ?? vi.fn().mockImplementation(async (input) => input),
    testFire: vi.fn().mockResolvedValue(undefined),
    setActiveSession:
      overrides.setActiveSession ?? vi.fn().mockResolvedValue(undefined),
    onPrefsUpdated:
      overrides.onPrefsUpdated ?? vi.fn().mockReturnValue(() => {}),
    onShowToast: vi.fn().mockReturnValue(() => {}),
    onPlaySound: vi.fn().mockReturnValue(() => {}),
    onFocusSession: vi.fn().mockReturnValue(() => {}),
  }
  ;(
    window as unknown as { electronAPI: { notifications: typeof api } }
  ).electronAPI = {
    notifications: api,
  }
  return api
}

function resetStore() {
  useNotificationsStore.setState({
    prefs: DEFAULT_NOTIFICATION_PREFS,
    isLoaded: false,
    unreadCount: 0,
    pulsingSessionIds: {},
    unsubscribePrefs: null,
  })
}

describe('useNotificationsStore', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  it('loadPrefs hydrates prefs and subscribes to updates', async () => {
    const hydrated: NotificationPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      enabled: false,
    }
    const captured: { callback: ((prefs: NotificationPrefs) => void) | null } =
      { callback: null }
    const unsubscribe = vi.fn()
    const api = installApiMocks({
      getPrefs: vi.fn().mockResolvedValue(hydrated),
      onPrefsUpdated: vi.fn((cb) => {
        captured.callback = cb
        return unsubscribe
      }),
    })

    await useNotificationsStore.getState().loadPrefs()

    expect(api.getPrefs).toHaveBeenCalledTimes(1)
    expect(useNotificationsStore.getState().prefs).toEqual(hydrated)
    expect(useNotificationsStore.getState().isLoaded).toBe(true)

    const next: NotificationPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      sounds: false,
    }
    expect(captured.callback).not.toBeNull()
    captured.callback?.(next)
    expect(useNotificationsStore.getState().prefs).toEqual(next)
  })

  it('loadPrefs unsubscribes the previous subscription when called again', async () => {
    const firstUnsub = vi.fn()
    installApiMocks({
      onPrefsUpdated: vi.fn().mockReturnValueOnce(firstUnsub),
    })

    await useNotificationsStore.getState().loadPrefs()
    await useNotificationsStore.getState().loadPrefs()

    expect(firstUnsub).toHaveBeenCalledTimes(1)
  })

  it('setPrefs writes through the api and stores the returned prefs', async () => {
    const stored: NotificationPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      toasts: false,
    }
    const api = installApiMocks({
      setPrefs: vi.fn().mockResolvedValue(stored),
    })

    const result = await useNotificationsStore
      .getState()
      .setPrefs({ ...DEFAULT_NOTIFICATION_PREFS, toasts: false })

    expect(api.setPrefs).toHaveBeenCalledWith({
      ...DEFAULT_NOTIFICATION_PREFS,
      toasts: false,
    })
    expect(result).toEqual(stored)
    expect(useNotificationsStore.getState().prefs).toEqual(stored)
  })

  it('setActiveSession forwards the id to the api', async () => {
    const api = installApiMocks()

    await useNotificationsStore.getState().setActiveSession('session-42')
    await useNotificationsStore.getState().setActiveSession(null)

    expect(api.setActiveSession).toHaveBeenNthCalledWith(1, 'session-42')
    expect(api.setActiveSession).toHaveBeenNthCalledWith(2, null)
  })

  it('incrementUnread and clearUnread update the counter', () => {
    installApiMocks()
    const { incrementUnread, clearUnread } = useNotificationsStore.getState()

    incrementUnread()
    incrementUnread()
    incrementUnread()
    expect(useNotificationsStore.getState().unreadCount).toBe(3)

    clearUnread()
    expect(useNotificationsStore.getState().unreadCount).toBe(0)
  })

  describe('pulseSession', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('marks the session as pulsing then clears after the timeout', () => {
      installApiMocks()
      useNotificationsStore.getState().pulseSession('s-1')

      expect(useNotificationsStore.getState().pulsingSessionIds).toEqual({
        's-1': true,
      })

      vi.advanceTimersByTime(PULSE_DURATION_MS)

      expect(useNotificationsStore.getState().pulsingSessionIds).toEqual({})
    })

    it('coalesces concurrent pulses for the same session', () => {
      installApiMocks()
      const { pulseSession } = useNotificationsStore.getState()

      pulseSession('s-1')
      vi.advanceTimersByTime(PULSE_DURATION_MS - 100)
      pulseSession('s-1')
      vi.advanceTimersByTime(150)

      // First timeout has fired but the second pulse re-added the entry.
      expect(useNotificationsStore.getState().pulsingSessionIds).toEqual({
        's-1': true,
      })

      vi.advanceTimersByTime(PULSE_DURATION_MS)
      expect(useNotificationsStore.getState().pulsingSessionIds).toEqual({})
    })
  })
})
