import type {
  NotificationDispatchPayload,
  NotificationPrefs,
  NotificationSeverity,
} from './notifications.types'

export const notificationsApi = {
  getPrefs: (): Promise<NotificationPrefs> =>
    window.electronAPI.notifications.getPrefs(),

  setPrefs: (input: NotificationPrefs): Promise<NotificationPrefs> =>
    window.electronAPI.notifications.setPrefs(input),

  testFire: (severity: NotificationSeverity): Promise<void> =>
    window.electronAPI.notifications.testFire(severity),

  setActiveSession: (sessionId: string | null): Promise<void> =>
    window.electronAPI.notifications.setActiveSession(sessionId),

  onPrefsUpdated: (
    callback: (prefs: NotificationPrefs) => void,
  ): (() => void) => window.electronAPI.notifications.onPrefsUpdated(callback),

  onShowToast: (
    callback: (payload: NotificationDispatchPayload) => void,
  ): (() => void) => window.electronAPI.notifications.onShowToast(callback),

  onPlaySound: (
    callback: (payload: NotificationDispatchPayload) => void,
  ): (() => void) => window.electronAPI.notifications.onPlaySound(callback),

  onFocusSession: (callback: (sessionId: string) => void): (() => void) =>
    window.electronAPI.notifications.onFocusSession(callback),

  onClearUnread: (callback: () => void): (() => void) =>
    window.electronAPI.notifications.onClearUnread(callback),
}
