import { create } from 'zustand'
import { notificationsApi } from './notifications.api'
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from './notifications.types'

export const PULSE_DURATION_MS = 600

interface NotificationsState {
  prefs: NotificationPrefs
  isLoaded: boolean
  unreadCount: number
  pulsingSessionIds: Record<string, true>
  unsubscribePrefs: (() => void) | null
}

interface NotificationsActions {
  loadPrefs: () => Promise<void>
  setPrefs: (input: NotificationPrefs) => Promise<NotificationPrefs>
  setActiveSession: (sessionId: string | null) => Promise<void>
  incrementUnread: () => void
  clearUnread: () => void
  pulseSession: (sessionId: string) => void
}

export type NotificationsStore = NotificationsState & NotificationsActions

export const useNotificationsStore = create<NotificationsStore>((set, get) => ({
  prefs: DEFAULT_NOTIFICATION_PREFS,
  isLoaded: false,
  unreadCount: 0,
  pulsingSessionIds: {},
  unsubscribePrefs: null,

  loadPrefs: async () => {
    const prefs = await notificationsApi.getPrefs()
    const existing = get().unsubscribePrefs
    if (existing) existing()
    const unsubscribePrefs = notificationsApi.onPrefsUpdated((updated) => {
      set({ prefs: updated })
    })
    set({ prefs, isLoaded: true, unsubscribePrefs })
  },

  setPrefs: async (input) => {
    const stored = await notificationsApi.setPrefs(input)
    set({ prefs: stored })
    return stored
  },

  setActiveSession: (sessionId) => notificationsApi.setActiveSession(sessionId),

  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),

  clearUnread: () => set({ unreadCount: 0 }),

  pulseSession: (sessionId) => {
    const existing = pulseTimeouts.get(sessionId)
    if (existing !== undefined) clearTimeout(existing)
    set((s) => ({
      pulsingSessionIds: { ...s.pulsingSessionIds, [sessionId]: true },
    }))
    const handle = setTimeout(() => {
      pulseTimeouts.delete(sessionId)
      set((s) => {
        if (!s.pulsingSessionIds[sessionId]) return s
        const next = { ...s.pulsingSessionIds }
        delete next[sessionId]
        return { pulsingSessionIds: next }
      })
    }, PULSE_DURATION_MS)
    pulseTimeouts.set(sessionId, handle)
  },
}))

// Tracks the active clear-pulse timeouts per session so a re-pulse before
// the prior timeout fires can cancel the stale clear and extend the pulse.
const pulseTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
