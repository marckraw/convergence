import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SystemNotificationService,
  type SystemNotificationFactory,
  type SystemNotificationLike,
} from './notifications.system'
import type {
  FormattedNotification,
  NotificationEvent,
} from './notifications.types'

interface FakeNotification extends SystemNotificationLike {
  show: ReturnType<typeof vi.fn<() => void>>
  close: ReturnType<typeof vi.fn<() => void>>
  emit: (event: 'click' | 'close' | 'failed') => void
  options: {
    title: string
    body: string
    subtitle?: string
    sound?: string
  }
}

function createFactory(): {
  factory: SystemNotificationFactory
  notifications: FakeNotification[]
} {
  const notifications: FakeNotification[] = []
  const factory: SystemNotificationFactory = (input) => {
    const handlers = new Map<string, () => void>()
    const fake: FakeNotification = {
      show: vi.fn<() => void>(),
      close: vi.fn<() => void>(),
      on: (event, listener) => {
        handlers.set(event, listener)
      },
      emit: (event) => {
        handlers.get(event)?.()
      },
      options: input,
    }
    notifications.push(fake)
    return fake
  }
  return { factory, notifications }
}

function makeEvent(
  kind: NotificationEvent['kind'],
  id = 'evt-1',
): NotificationEvent {
  return {
    id,
    kind,
    sessionId: 'sess-1',
    sessionName: 'Session',
    projectName: 'Project',
    firedAt: 0,
  }
}

const formatted: FormattedNotification = {
  title: 'Title',
  body: 'Body',
  subtitle: 'Subtitle',
}

describe('SystemNotificationService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a notification with severity-specific sound and tracks it live', () => {
    const { factory, notifications } = createFactory()
    const onClick = vi.fn()
    const service = new SystemNotificationService({
      createNotification: factory,
      onClick,
      now: () => 1000,
    })

    service.show(makeEvent('agent.finished'), formatted)
    service.show(makeEvent('agent.errored', 'evt-2'), formatted)

    expect(notifications).toHaveLength(2)
    expect(notifications[0]?.options.sound).toBe('Glass')
    expect(notifications[1]?.options.sound).toBe('Hero')
    expect(notifications[0]?.show).toHaveBeenCalledTimes(1)
    expect(service.size()).toBe(2)
  })

  it('passes the event to onClick and evicts the entry', () => {
    const { factory, notifications } = createFactory()
    const onClick = vi.fn()
    const service = new SystemNotificationService({
      createNotification: factory,
      onClick,
    })
    const event = makeEvent('agent.finished')

    service.show(event, formatted)
    notifications[0]?.emit('click')

    expect(onClick).toHaveBeenCalledWith(event)
    expect(service.size()).toBe(0)
  })

  it('evicts on close and failed events', () => {
    const { factory, notifications } = createFactory()
    const service = new SystemNotificationService({
      createNotification: factory,
      onClick: vi.fn(),
    })

    service.show(makeEvent('agent.finished', 'a'), formatted)
    service.show(makeEvent('agent.errored', 'b'), formatted)
    notifications[0]?.emit('close')
    notifications[1]?.emit('failed')

    expect(service.size()).toBe(0)
  })

  it('sweeps entries older than 60 seconds via the interval', () => {
    const { factory, notifications } = createFactory()
    let now = 0
    const service = new SystemNotificationService({
      createNotification: factory,
      onClick: vi.fn(),
      now: () => now,
    })

    service.show(makeEvent('agent.finished', 'old'), formatted)
    now = 30_000
    service.show(makeEvent('agent.errored', 'fresh'), formatted)

    now = 70_000
    vi.advanceTimersByTime(30_000)

    expect(notifications[0]?.close).toHaveBeenCalledTimes(1)
    expect(notifications[1]?.close).not.toHaveBeenCalled()
    expect(service.size()).toBe(1)
  })

  it('stops the sweep interval after the live map drains', () => {
    const { factory, notifications } = createFactory()
    let now = 0
    const service = new SystemNotificationService({
      createNotification: factory,
      onClick: vi.fn(),
      now: () => now,
    })

    service.show(makeEvent('agent.finished'), formatted)
    now = 70_000
    vi.advanceTimersByTime(30_000)
    expect(service.size()).toBe(0)

    // After drain a brand new show should restart the interval (no error
    // and the new entry is tracked).
    service.show(makeEvent('agent.errored', 'next'), formatted)
    expect(service.size()).toBe(1)
    expect(notifications[1]?.show).toHaveBeenCalledTimes(1)
  })

  it('dispose closes outstanding notifications and clears the interval', () => {
    const { factory, notifications } = createFactory()
    const service = new SystemNotificationService({
      createNotification: factory,
      onClick: vi.fn(),
    })
    service.show(makeEvent('agent.finished', 'a'), formatted)
    service.show(makeEvent('agent.errored', 'b'), formatted)

    service.dispose()

    expect(notifications[0]?.close).toHaveBeenCalledTimes(1)
    expect(notifications[1]?.close).toHaveBeenCalledTimes(1)
    expect(service.size()).toBe(0)
  })
})
