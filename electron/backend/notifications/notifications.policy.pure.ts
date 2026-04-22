import type {
  FormattedNotification,
  NotificationChannel,
  NotificationEvent,
  NotificationEventKind,
  NotificationPrefs,
  NotificationSeverity,
  WindowState,
} from './notifications.types'

export const MAX_BODY_LENGTH = 200

export function eventSeverity(
  kind: NotificationEventKind,
): NotificationSeverity {
  return kind === 'agent.finished' ? 'info' : 'critical'
}

function isEventEnabled(
  kind: NotificationEventKind,
  prefs: NotificationPrefs,
): boolean {
  switch (kind) {
    case 'agent.finished':
      return prefs.events.finished
    case 'agent.needs_input':
      return prefs.events.needsInput
    case 'agent.needs_approval':
      return prefs.events.needsApproval
    case 'agent.errored':
      return prefs.events.errored
  }
}

export function decideChannels(
  event: NotificationEvent,
  windowState: WindowState,
  prefs: NotificationPrefs,
): Set<NotificationChannel> {
  const channels = new Set<NotificationChannel>()

  if (!prefs.enabled) return channels
  if (!isEventEnabled(event.kind, prefs)) return channels

  const severity = eventSeverity(event.kind)
  const { isFocused, isVisible, activeSessionId } = windowState
  const isThisSession =
    isFocused && isVisible && activeSessionId === event.sessionId

  // Inline pulse fires only when the user is already looking at the session.
  if (isThisSession) {
    channels.add('inline-pulse')
  }

  // When focused on the active session, suppression hides toast/sound by default.
  const suppressed = isThisSession && prefs.suppressWhenFocused

  if (!suppressed) {
    channels.add('toast')
    // Sound severity rule: when window is focused at all, always use soft.
    // Once unfocused, severity follows the event.
    if (isFocused && severity === 'critical') {
      channels.add('sound-soft')
    } else if (severity === 'critical') {
      channels.add('sound-alert')
    } else {
      channels.add('sound-soft')
    }
    channels.add('dock-badge')
  }

  // OS-level surfaces only when the window is not focused.
  if (!isFocused) {
    channels.add('system-notification')
    channels.add(
      severity === 'critical' ? 'dock-bounce-crit' : 'dock-bounce-info',
    )
    if (severity === 'critical') {
      channels.add('flash-frame')
    }
  }

  // Apply per-channel preference masks last.
  if (!prefs.toasts) channels.delete('toast')
  if (!prefs.sounds) {
    channels.delete('sound-soft')
    channels.delete('sound-alert')
  }
  if (!prefs.system) channels.delete('system-notification')
  if (!prefs.dockBadge) channels.delete('dock-badge')
  if (!prefs.dockBounce) {
    channels.delete('dock-bounce-info')
    channels.delete('dock-bounce-crit')
  }

  return channels
}

const TITLE_BY_KIND: Record<NotificationEventKind, (name: string) => string> = {
  'agent.finished': (name) => `${name} finished`,
  'agent.needs_input': (name) => `${name} needs input`,
  'agent.needs_approval': (name) => `${name} needs approval`,
  'agent.errored': (name) => `${name} errored`,
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

export function formatTitleAndBody(
  event: NotificationEvent,
): FormattedNotification {
  const title = TITLE_BY_KIND[event.kind](event.sessionName)
  const body = truncate(event.projectName, MAX_BODY_LENGTH)
  return { title, body }
}
