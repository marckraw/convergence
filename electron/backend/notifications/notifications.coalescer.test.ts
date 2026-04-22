import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemNotificationCoalescer } from './notifications.coalescer'
import type {
  FormattedNotification,
  NotificationEvent,
  NotificationEventKind,
} from './notifications.types'

function makeEvent(
  kind: NotificationEventKind,
  sessionName: string,
  id = `evt-${sessionName}`,
): NotificationEvent {
  return {
    id,
    kind,
    sessionId: `sess-${sessionName}`,
    sessionName,
    projectName: 'Project',
    firedAt: 0,
  }
}

const formatted = (title: string): FormattedNotification => ({
  title,
  body: 'body',
})

describe('SystemNotificationCoalescer', () => {
  type FireFn = (
    event: NotificationEvent,
    formatted: FormattedNotification,
  ) => void

  let now: number
  let fire: ReturnType<typeof vi.fn<FireFn>>
  let coalescer: SystemNotificationCoalescer
  let summaryCounter: number

  beforeEach(() => {
    vi.useFakeTimers()
    now = 1_000
    fire = vi.fn<FireFn>()
    summaryCounter = 0
    coalescer = new SystemNotificationCoalescer({
      fire,
      now: () => now,
      windowMs: 5_000,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 3,
      buildSummaryId: () => `sum-${++summaryCounter}`,
    })
  })

  afterEach(() => {
    coalescer.dispose()
    vi.useRealTimers()
  })

  it('fires a single event in the window as-is', () => {
    coalescer.add(
      'info',
      makeEvent('agent.finished', 'Alpha'),
      formatted('Alpha finished'),
    )

    expect(fire).toHaveBeenCalledTimes(1)
    expect(fire).toHaveBeenCalledWith(
      expect.objectContaining({ sessionName: 'Alpha' }),
      expect.objectContaining({ title: 'Alpha finished' }),
    )

    vi.advanceTimersByTime(5_000)
    expect(fire).toHaveBeenCalledTimes(1)
  })

  it('collapses two events in the window to one summary on flush', () => {
    coalescer.add(
      'info',
      makeEvent('agent.finished', 'Alpha'),
      formatted('Alpha finished'),
    )
    now += 1_000
    coalescer.add(
      'info',
      makeEvent('agent.finished', 'Beta'),
      formatted('Beta finished'),
    )
    now += 1_000
    coalescer.add(
      'info',
      makeEvent('agent.finished', 'Gamma'),
      formatted('Gamma finished'),
    )

    expect(fire).toHaveBeenCalledTimes(1)

    now += 4_000
    vi.advanceTimersByTime(5_000)

    expect(fire).toHaveBeenCalledTimes(2)
    const [summaryEvent, summaryFormatted] = fire.mock.calls[1]!
    expect(summaryEvent.id).toBe('sum-1')
    expect(summaryFormatted.title).toBe('2 sessions finished')
    expect(summaryFormatted.body).toBe('Beta, Gamma')
  })

  it('uses severity-specific verbs in the summary', () => {
    coalescer.add(
      'critical',
      makeEvent('agent.errored', 'Alpha'),
      formatted('Alpha errored'),
    )
    now += 1_000
    coalescer.add(
      'critical',
      makeEvent('agent.errored', 'Beta'),
      formatted('Beta errored'),
    )

    now += 5_000
    vi.advanceTimersByTime(5_000)

    expect(fire).toHaveBeenCalledTimes(2)
    expect(fire.mock.calls[1]![1].title).toBe('1 sessions need attention')
  })

  it('keeps critical and info buckets independent', () => {
    // Bump the rate budget so the test focuses on bucket isolation rather
    // than rate limiting (covered separately).
    coalescer = new SystemNotificationCoalescer({
      fire,
      now: () => now,
      windowMs: 5_000,
      rateLimitWindowMs: 60_000,
      rateLimitMax: 10,
      buildSummaryId: () => `sum-${++summaryCounter}`,
    })

    coalescer.add(
      'info',
      makeEvent('agent.finished', 'Alpha'),
      formatted('Alpha finished'),
    )
    coalescer.add(
      'critical',
      makeEvent('agent.errored', 'Crit1'),
      formatted('Crit1 errored'),
    )

    expect(fire).toHaveBeenCalledTimes(2)

    coalescer.add(
      'info',
      makeEvent('agent.finished', 'Beta'),
      formatted('Beta finished'),
    )
    coalescer.add(
      'critical',
      makeEvent('agent.errored', 'Crit2'),
      formatted('Crit2 errored'),
    )

    now += 5_000
    vi.advanceTimersByTime(5_000)

    expect(fire).toHaveBeenCalledTimes(4)
    const summaries = fire.mock.calls.slice(2)
    const titles = summaries.map(([, f]) => f.title)
    expect(titles).toContain('1 sessions finished')
    expect(titles).toContain('1 sessions need attention')
  })

  it('drops the 4th immediate fire within the rate-limit window', () => {
    coalescer.add('info', makeEvent('agent.finished', 'A'), formatted('A'))
    now += 6_000
    vi.advanceTimersByTime(5_000)
    coalescer.add('info', makeEvent('agent.finished', 'B'), formatted('B'))
    now += 6_000
    vi.advanceTimersByTime(5_000)
    coalescer.add('critical', makeEvent('agent.errored', 'C'), formatted('C'))
    now += 6_000
    vi.advanceTimersByTime(5_000)

    // Three system fires landed within 60s.
    expect(fire).toHaveBeenCalledTimes(3)

    coalescer.add('info', makeEvent('agent.finished', 'D'), formatted('D'))
    expect(fire).toHaveBeenCalledTimes(3)

    // Flush D's window (rate-limited so still no fire) and slide past 60s
    // so the budget refills before E lands.
    now += 5_000
    vi.advanceTimersByTime(5_000)
    expect(fire).toHaveBeenCalledTimes(3)

    now = 70_000
    coalescer.add('info', makeEvent('agent.finished', 'E'), formatted('E'))
    expect(fire).toHaveBeenCalledTimes(4)
  })

  it('drops the summary when the rate budget is exhausted at flush time', () => {
    coalescer.add('info', makeEvent('agent.finished', 'A'), formatted('A'))
    now += 6_000
    vi.advanceTimersByTime(5_000)
    coalescer.add('info', makeEvent('agent.finished', 'B'), formatted('B'))
    now += 6_000
    vi.advanceTimersByTime(5_000)
    coalescer.add('info', makeEvent('agent.finished', 'C'), formatted('C'))
    now += 6_000
    vi.advanceTimersByTime(5_000)
    expect(fire).toHaveBeenCalledTimes(3)

    coalescer.add('info', makeEvent('agent.finished', 'D'), formatted('D'))
    coalescer.add('info', makeEvent('agent.finished', 'E'), formatted('E'))
    now += 5_000
    vi.advanceTimersByTime(5_000)

    expect(fire).toHaveBeenCalledTimes(3)
  })
})
