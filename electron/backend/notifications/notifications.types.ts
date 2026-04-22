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

export interface WindowState {
  isFocused: boolean
  isVisible: boolean
  activeSessionId: string | null
}

export interface NotificationPrefs {
  enabled: boolean
  toasts: boolean
  sounds: boolean
  system: boolean
  dockBadge: boolean
  dockBounce: boolean
  events: {
    finished: boolean
    needsInput: boolean
    needsApproval: boolean
    errored: boolean
  }
  suppressWhenFocused: boolean
}

export interface FormattedNotification {
  title: string
  body: string
  subtitle?: string
}
