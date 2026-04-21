import { describe, expect, it } from 'vitest'
import { applyEvent, shouldEvictSnapshot } from './task-progress.pure'
import type { TaskProgressSnapshot } from './task-progress.types'

const REQ = 'req-1'

describe('task-progress.pure', () => {
  describe('applyEvent', () => {
    it('creates a fresh snapshot on started, ignoring any prior state', () => {
      const prior: TaskProgressSnapshot = {
        requestId: REQ,
        startedAt: 0,
        lastEventAt: 500,
        stdoutBytes: 42,
        stderrBytes: 7,
        settled: { at: 500, outcome: 'ok' },
      }
      const next = applyEvent(prior, {
        requestId: REQ,
        kind: 'started',
        at: 1000,
      })
      expect(next).toEqual({
        requestId: REQ,
        startedAt: 1000,
        lastEventAt: 1000,
        stdoutBytes: 0,
        stderrBytes: 0,
        settled: null,
      })
    })

    it('accumulates stdout bytes and updates lastEventAt', () => {
      const s0 = applyEvent(null, { requestId: REQ, kind: 'started', at: 100 })
      const s1 = applyEvent(s0, {
        requestId: REQ,
        kind: 'stdout-chunk',
        at: 200,
        bytes: 128,
      })
      const s2 = applyEvent(s1, {
        requestId: REQ,
        kind: 'stdout-chunk',
        at: 350,
        bytes: 64,
      })
      expect(s2.stdoutBytes).toBe(192)
      expect(s2.lastEventAt).toBe(350)
      expect(s2.stderrBytes).toBe(0)
    })

    it('accumulates stderr bytes separately from stdout', () => {
      const s0 = applyEvent(null, { requestId: REQ, kind: 'started', at: 0 })
      const s1 = applyEvent(s0, {
        requestId: REQ,
        kind: 'stderr-chunk',
        at: 100,
        bytes: 10,
      })
      const s2 = applyEvent(s1, {
        requestId: REQ,
        kind: 'stdout-chunk',
        at: 200,
        bytes: 5,
      })
      expect(s2.stderrBytes).toBe(10)
      expect(s2.stdoutBytes).toBe(5)
      expect(s2.lastEventAt).toBe(200)
    })

    it('marks settled and preserves byte counters', () => {
      const s0 = applyEvent(null, { requestId: REQ, kind: 'started', at: 0 })
      const s1 = applyEvent(s0, {
        requestId: REQ,
        kind: 'stdout-chunk',
        at: 100,
        bytes: 50,
      })
      const settled = applyEvent(s1, {
        requestId: REQ,
        kind: 'settled',
        at: 200,
        outcome: 'ok',
      })
      expect(settled.settled).toEqual({ at: 200, outcome: 'ok' })
      expect(settled.stdoutBytes).toBe(50)
      expect(settled.lastEventAt).toBe(200)
    })

    it('synthesises a snapshot when the first event is not started', () => {
      const s = applyEvent(null, {
        requestId: REQ,
        kind: 'stdout-chunk',
        at: 500,
        bytes: 16,
      })
      expect(s.startedAt).toBe(500)
      expect(s.stdoutBytes).toBe(16)
    })

    it.each(['ok', 'error', 'timeout'] as const)(
      'records %s outcome',
      (outcome) => {
        const s = applyEvent(null, {
          requestId: REQ,
          kind: 'settled',
          at: 10,
          outcome,
        })
        expect(s.settled?.outcome).toBe(outcome)
      },
    )
  })

  describe('shouldEvictSnapshot', () => {
    const baseSnapshot: TaskProgressSnapshot = {
      requestId: REQ,
      startedAt: 0,
      lastEventAt: 0,
      stdoutBytes: 0,
      stderrBytes: 0,
      settled: null,
    }

    it('never evicts an in-flight snapshot', () => {
      expect(shouldEvictSnapshot(baseSnapshot, 1_000_000, 10_000)).toBe(false)
    })

    it('evicts once grace has elapsed after settled', () => {
      const settled: TaskProgressSnapshot = {
        ...baseSnapshot,
        settled: { at: 1000, outcome: 'ok' },
      }
      expect(shouldEvictSnapshot(settled, 10_999, 10_000)).toBe(false)
      expect(shouldEvictSnapshot(settled, 11_000, 10_000)).toBe(true)
      expect(shouldEvictSnapshot(settled, 99_999, 10_000)).toBe(true)
    })
  })
})
