import type { NotificationPrefs } from './notifications.types'

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  toasts: true,
  sounds: true,
  system: true,
  dockBadge: true,
  dockBounce: true,
  events: {
    finished: true,
    needsInput: true,
    needsApproval: true,
    errored: true,
  },
  suppressWhenFocused: true,
}
