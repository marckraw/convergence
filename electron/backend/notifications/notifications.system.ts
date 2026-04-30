import type {
  FormattedNotification,
  NotificationEvent,
  NotificationEventKind,
  NotificationSeverity,
} from './notifications.types'

export interface SystemNotificationLike {
  show(): void
  close(): void
  on(event: 'click' | 'close' | 'failed', listener: () => void): void
}

export interface SystemNotificationFactoryInput {
  title: string
  body: string
  subtitle?: string
  sound?: string
}

export type SystemNotificationFactory = (
  input: SystemNotificationFactoryInput,
) => SystemNotificationLike

export interface SystemNotificationDeps {
  createNotification: SystemNotificationFactory
  onClick: (event: NotificationEvent) => void
  now?: () => number
}

const SWEEP_INTERVAL_MS = 30_000
const MAX_AGE_MS = 60_000

function severityFromKind(kind: NotificationEventKind): NotificationSeverity {
  return kind === 'agent.finished' ? 'info' : 'critical'
}

function soundForSeverity(severity: NotificationSeverity): string {
  return severity === 'info' ? 'Glass' : 'Hero'
}

interface LiveEntry {
  notification: SystemNotificationLike
  shownAt: number
}

export class SystemNotificationService {
  private readonly live = new Map<string, LiveEntry>()
  private sweepHandle: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: SystemNotificationDeps) {}

  show(event: NotificationEvent, formatted: FormattedNotification): void {
    const severity = severityFromKind(event.kind)
    const notification = this.deps.createNotification({
      title: formatted.title,
      body: formatted.body,
      subtitle: formatted.subtitle,
      sound: soundForSeverity(severity),
    })

    notification.on('click', () => {
      this.evict(event.id)
      this.deps.onClick(event)
    })
    notification.on('close', () => this.evict(event.id))
    notification.on('failed', () => this.evict(event.id))

    notification.show()
    this.live.set(event.id, { notification, shownAt: this.now() })
    this.ensureSweepRunning()
  }

  // Exposed for tests; in production the interval handles it.
  sweep(): void {
    const cutoff = this.now() - MAX_AGE_MS
    for (const [id, entry] of this.live) {
      if (entry.shownAt <= cutoff) {
        entry.notification.close()
        this.live.delete(id)
      }
    }
    if (this.live.size === 0 && this.sweepHandle !== null) {
      clearInterval(this.sweepHandle)
      this.sweepHandle = null
    }
  }

  dispose(): void {
    if (this.sweepHandle !== null) {
      clearInterval(this.sweepHandle)
      this.sweepHandle = null
    }
    for (const [, entry] of this.live) {
      entry.notification.close()
    }
    this.live.clear()
  }

  size(): number {
    return this.live.size
  }

  private ensureSweepRunning(): void {
    if (this.sweepHandle !== null) return
    this.sweepHandle = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS)
  }

  private evict(id: string): void {
    this.live.delete(id)
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now()
  }
}
