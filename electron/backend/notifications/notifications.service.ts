import { randomUUID } from 'crypto'
import type { AttentionState } from '../provider/provider.types'
import type { Session } from '../session/session.types'
import { DEFAULT_NOTIFICATION_PREFS } from './notifications.defaults'
import { decideChannels, formatTitleAndBody } from './notifications.policy.pure'
import { detectEvent } from './notifications.transitions.pure'
import type {
  FormattedNotification,
  NotificationChannel,
  NotificationEvent,
  NotificationPrefs,
  WindowState,
} from './notifications.types'

export interface NotificationDispatchPayload {
  channel: NotificationChannel
  event: NotificationEvent
  formatted: FormattedNotification
}

export interface NotificationsServiceDeps {
  getPrefs: () => NotificationPrefs
  getWindowState: () => WindowState
  getProjectName: (projectId: string) => string | null
  dispatch: (payload: NotificationDispatchPayload) => void
  now?: () => number
}

export class NotificationsService {
  constructor(private readonly deps: NotificationsServiceDeps) {}

  onAttentionTransition(
    prev: AttentionState,
    next: AttentionState,
    session: Session,
  ): void {
    const kind = detectEvent(prev, next)
    if (!kind) return

    this.fire(this.buildEvent(kind, session))
  }

  fire(event: NotificationEvent, opts: { bypass?: boolean } = {}): void {
    const channels = opts.bypass
      ? decideChannels(event, BYPASS_WINDOW_STATE, DEFAULT_NOTIFICATION_PREFS)
      : decideChannels(event, this.deps.getWindowState(), this.deps.getPrefs())
    if (channels.size === 0) return

    const formatted = formatTitleAndBody(event)
    for (const channel of channels) {
      this.deps.dispatch({ channel, event, formatted })
    }
  }

  buildEvent(
    kind: NotificationEvent['kind'],
    session: Pick<Session, 'id' | 'name' | 'projectId'>,
  ): NotificationEvent {
    const projectName = session.projectId
      ? this.deps.getProjectName(session.projectId)
      : null

    return {
      id: randomUUID(),
      kind,
      sessionId: session.id,
      sessionName: session.name,
      projectName: projectName ?? 'Convergence',
      firedAt: this.deps.now ? this.deps.now() : Date.now(),
    }
  }

  forgetSession(_sessionId: string): void {}
}

const BYPASS_WINDOW_STATE: WindowState = {
  isFocused: false,
  isVisible: true,
  activeSessionId: null,
}
