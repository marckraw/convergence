import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdatesService } from './updates.service'
import type { UpdateStatus } from './updates.types'
import {
  INTERVAL_MS,
  STARTUP_DELAY_MS,
  UpdatesScheduler,
} from './updates.scheduler'

function makeService(statusPhase: UpdateStatus['phase'] = 'idle') {
  const status: UpdateStatus =
    statusPhase === 'idle'
      ? { phase: 'idle', lastChecked: null, lastError: null }
      : statusPhase === 'checking'
        ? { phase: 'checking', startedAt: '2026-04-22T17:00:00.000Z' }
        : statusPhase === 'downloading'
          ? {
              phase: 'downloading',
              version: '0.17.0',
              percent: 10,
              bytesPerSecond: 100,
            }
          : statusPhase === 'downloaded'
            ? {
                phase: 'downloaded',
                version: '0.17.0',
                releaseNotesUrl: 'https://example.test/v0.17.0',
              }
            : { phase: 'idle', lastChecked: null, lastError: null }
  return {
    getStatus: vi.fn<() => UpdateStatus>(() => status),
    check: vi.fn<UpdatesService['check']>((): UpdateStatus => status),
  } as unknown as UpdatesService & {
    getStatus: ReturnType<typeof vi.fn>
    check: ReturnType<typeof vi.fn>
  }
}

describe('UpdatesScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires a startup check 10s after start then every 4h', () => {
    const service = makeService('idle')
    const scheduler = new UpdatesScheduler({
      service,
      getPrefs: () => ({ backgroundCheckEnabled: true }),
    })
    scheduler.start()

    vi.advanceTimersByTime(STARTUP_DELAY_MS - 1)
    expect(service.check).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(service.check).toHaveBeenCalledTimes(1)
    expect(service.check).toHaveBeenLastCalledWith('background')

    vi.advanceTimersByTime(INTERVAL_MS)
    expect(service.check).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(INTERVAL_MS)
    expect(service.check).toHaveBeenCalledTimes(3)

    scheduler.stop()
  })

  it('skips a tick while the service is mid-flow', () => {
    const service = makeService('downloading')
    const scheduler = new UpdatesScheduler({
      service,
      getPrefs: () => ({ backgroundCheckEnabled: true }),
    })
    scheduler.start()
    vi.advanceTimersByTime(STARTUP_DELAY_MS + INTERVAL_MS)
    expect(service.check).not.toHaveBeenCalled()
    scheduler.stop()
  })

  it('does not start a timer when backgroundCheckEnabled is false', () => {
    const service = makeService('idle')
    const scheduler = new UpdatesScheduler({
      service,
      getPrefs: () => ({ backgroundCheckEnabled: false }),
    })
    scheduler.start()
    vi.advanceTimersByTime(STARTUP_DELAY_MS + INTERVAL_MS * 2)
    expect(service.check).not.toHaveBeenCalled()
    scheduler.stop()
  })

  it('starts checking after onPrefsChanged flips false → true', () => {
    const prefs = { backgroundCheckEnabled: false }
    const service = makeService('idle')
    const scheduler = new UpdatesScheduler({
      service,
      getPrefs: () => prefs,
    })
    scheduler.start()
    vi.advanceTimersByTime(STARTUP_DELAY_MS)
    expect(service.check).not.toHaveBeenCalled()

    prefs.backgroundCheckEnabled = true
    scheduler.onPrefsChanged(prefs)

    vi.advanceTimersByTime(STARTUP_DELAY_MS)
    expect(service.check).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  it('clears timers when onPrefsChanged flips true → false', () => {
    const prefs = { backgroundCheckEnabled: true }
    const service = makeService('idle')
    const scheduler = new UpdatesScheduler({
      service,
      getPrefs: () => prefs,
    })
    scheduler.start()
    vi.advanceTimersByTime(STARTUP_DELAY_MS)
    expect(service.check).toHaveBeenCalledTimes(1)

    prefs.backgroundCheckEnabled = false
    scheduler.onPrefsChanged(prefs)
    vi.advanceTimersByTime(INTERVAL_MS * 3)
    expect(service.check).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  it('stop() is idempotent', () => {
    const service = makeService('idle')
    const scheduler = new UpdatesScheduler({
      service,
      getPrefs: () => ({ backgroundCheckEnabled: true }),
    })
    scheduler.start()
    scheduler.stop()
    scheduler.stop()
    vi.advanceTimersByTime(INTERVAL_MS * 2)
    expect(service.check).not.toHaveBeenCalled()
  })
})
