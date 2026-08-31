import { randomUUID } from 'crypto'
import type {
  FormattedNotification,
  NotificationEvent,
  NotificationSeverity,
} from './notifications.types'

export interface CoalescerEntry {
  event: NotificationEvent
  formatted: FormattedNotification
}

export interface SystemNotificationCoalescerDeps {
  fire: (event: NotificationEvent, formatted: FormattedNotification) => void
  now?: () => number
  // Defaults match the spec: 5s collapse window, 60s rate-limit window,
  // 3 system fires per minute. Override in tests to keep them fast.
  windowMs?: number
  rateLimitWindowMs?: number
  rateLimitMax?: number
  buildSummaryId?: () => string
}

interface SeverityBucket {
  buffer: CoalescerEntry[]
  windowHandle: ReturnType<typeof setTimeout> | null
  windowOpenedAt: number
}

const VERB_BY_SEVERITY: Record<NotificationSeverity, string> = {
  info: 'finished',
  critical: 'need attention',
}

const MAX_SUMMARY_BODY = 200

function buildSummary(
  severity: NotificationSeverity,
  entries: CoalescerEntry[],
  now: number,
  id: string,
): CoalescerEntry {
  const count = entries.length
  const verb = VERB_BY_SEVERITY[severity]
  const title = `${count} sessions ${verb}`
  const sessionNames = entries.map((entry) => entry.event.sessionName)
  const body = truncate(sessionNames.join(', '), MAX_SUMMARY_BODY)
  // The summary borrows session/project identity from the first entry so
  // the click handler still has a real session to focus on. Severity is
  // recoverable from the event kind, so the coalesced event uses the
  // first entry's kind.
  const first = entries[0].event
  return {
    event: {
      id,
      kind: first.kind,
      sessionId: first.sessionId,
      sessionName: first.sessionName,
      projectName: first.projectName,
      firedAt: now,
    },
    formatted: { title, body },
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

export class SystemNotificationCoalescer {
  private readonly buckets = new Map<NotificationSeverity, SeverityBucket>()
  private readonly recentFires: number[] = []
  private readonly windowMs: number
  private readonly rateLimitWindowMs: number
  private readonly rateLimitMax: number
  private readonly buildSummaryId: () => string

  constructor(private readonly deps: SystemNotificationCoalescerDeps) {
    this.windowMs = deps.windowMs ?? 5_000
    this.rateLimitWindowMs = deps.rateLimitWindowMs ?? 60_000
    this.rateLimitMax = deps.rateLimitMax ?? 3
    this.buildSummaryId = deps.buildSummaryId ?? (() => randomUUID())
  }

  add(
    severity: NotificationSeverity,
    event: NotificationEvent,
    formatted: FormattedNotification,
  ): void {
    const bucket = this.getBucket(severity)
    if (bucket.windowHandle === null) {
      this.openWindow(bucket, severity)
      // First event in the window fires immediately if rate budget allows.
      // When rate-limited, drop the system surface for this event — toast
      // and badge fire through the regular dispatch fan-out and aren't
      // affected by this layer.
      if (this.canFireNow()) {
        this.recordFire(this.now())
        this.deps.fire(event, formatted)
      }
      return
    }
    // Window is open — buffer the event for the eventual summary.
    bucket.buffer.push({ event, formatted })
  }

  dispose(): void {
    for (const bucket of this.buckets.values()) {
      if (bucket.windowHandle !== null) {
        clearTimeout(bucket.windowHandle)
        bucket.windowHandle = null
      }
      bucket.buffer = []
    }
  }

  private getBucket(severity: NotificationSeverity): SeverityBucket {
    const existing = this.buckets.get(severity)
    if (existing) return existing
    const fresh: SeverityBucket = {
      buffer: [],
      windowHandle: null,
      windowOpenedAt: 0,
    }
    this.buckets.set(severity, fresh)
    return fresh
  }

  private openWindow(
    bucket: SeverityBucket,
    severity: NotificationSeverity,
  ): void {
    bucket.windowOpenedAt = this.now()
    bucket.windowHandle = setTimeout(() => this.flush(severity), this.windowMs)
  }

  private flush(severity: NotificationSeverity): void {
    const bucket = this.buckets.get(severity)
    if (!bucket) return
    bucket.windowHandle = null
    if (bucket.buffer.length === 0) return
    const entries = bucket.buffer
    bucket.buffer = []
    if (!this.canFireNow()) {
      // Rate-limited at flush time: drop the summary. Future events open a
      // fresh window once the rate budget refills.
      return
    }
    const now = this.now()
    const summary = buildSummary(severity, entries, now, this.buildSummaryId())
    this.recordFire(now)
    this.deps.fire(summary.event, summary.formatted)
  }

  private canFireNow(): boolean {
    this.pruneRateLimit()
    return this.recentFires.length < this.rateLimitMax
  }

  private recordFire(at: number): void {
    this.recentFires.push(at)
  }

  private pruneRateLimit(): void {
    const cutoff = this.now() - this.rateLimitWindowMs
    while (this.recentFires.length > 0 && this.recentFires[0] <= cutoff) {
      this.recentFires.shift()
    }
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now()
  }
}
