// Source of truth for notification types in the renderer.
// MUST stay byte-equivalent to electron/backend/notifications/notifications.types.ts.
// Renderer tsconfig cannot import from electron/, so the duplication is intentional.
// If you change one, change the other.

export type NotificationEventKind =
  | 'agent.finished'
  | 'agent.needs_approval'
  | 'agent.needs_input'
  | 'agent.errored'

export type NotificationSeverity = 'info' | 'critical'

export interface NotificationEvent {
  id: string
  kind: NotificationEventKind
  sessionId: string
  sessionName: string
  projectName: string
  firedAt: number
}

export type NotificationChannel =
  | 'inline-pulse'
  | 'toast'
  | 'sound-soft'
  | 'sound-alert'
  | 'dock-badge'
  | 'dock-bounce-info'
  | 'dock-bounce-crit'
  | 'flash-frame'
  | 'system-notification'

export interface NotificationEventPrefs {
  finished: boolean
  needsInput: boolean
  needsApproval: boolean
  errored: boolean
}

export interface NotificationPrefs {
  enabled: boolean
  toasts: boolean
  sounds: boolean
  system: boolean
  dockBadge: boolean
  dockBounce: boolean
  events: NotificationEventPrefs
  suppressWhenFocused: boolean
}

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

export interface FormattedNotification {
  title: string
  body: string
  subtitle?: string
}

export interface NotificationDispatchPayload {
  channel: NotificationChannel
  event: NotificationEvent
  formatted: FormattedNotification
}
