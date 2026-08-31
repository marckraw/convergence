import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionLivenessService } from './session-liveness.service'
import type { SessionStatus } from './session.types'

describe('SessionLivenessService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function createHarness(status: SessionStatus | null = 'running') {
    vi.useFakeTimers()
    let now = 0
    let isOpen = true
    const notes: Array<{ sessionId: string; kind: 'quiet' | 'silent' }> = []
    const service = new SessionLivenessService({
      isOpen: () => isOpen,
      getSummary: () => (status ? { status } : null),
      emitNote: (sessionId, kind) => notes.push({ sessionId, kind }),
      now: () => now,
    })

    return {
      notes,
      service,
      setNow: (value: number) => {
        now = value
      },
      close: () => {
        isOpen = false
      },
    }
  }

  it('emits quiet and silent notes at the liveness thresholds', () => {
    const harness = createHarness()

    harness.service.bump('session-1')
    harness.setNow(60_000)
    harness.service.triggerTickForTest()
    harness.setNow(180_000)
    harness.service.triggerTickForTest()

    expect(harness.notes).toEqual([
      { sessionId: 'session-1', kind: 'quiet' },
      { sessionId: 'session-1', kind: 'silent' },
    ])
  })

  it('resets warning flags when a new event arrives', () => {
    const harness = createHarness()

    harness.service.bump('session-1')
    harness.setNow(60_000)
    harness.service.triggerTickForTest()
    harness.setNow(65_000)
    harness.service.bump('session-1')
    harness.setNow(125_000)
    harness.service.triggerTickForTest()

    expect(harness.notes).toEqual([
      { sessionId: 'session-1', kind: 'quiet' },
      { sessionId: 'session-1', kind: 'quiet' },
    ])
  })

  it('clears state without emitting when storage closes', () => {
    const harness = createHarness()

    harness.service.bump('session-1')
    harness.close()
    harness.setNow(180_000)
    harness.service.triggerTickForTest()

    expect(harness.notes).toEqual([])
  })

  it('drops sessions that are no longer running', () => {
    const harness = createHarness('completed')

    harness.service.bump('session-1')
    harness.setNow(180_000)
    harness.service.triggerTickForTest()

    expect(harness.notes).toEqual([])
  })
})
