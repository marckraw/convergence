import { describe, expect, it } from 'vitest'
import { applyEvent } from './task-progress.pure'
import type { TaskProgressSnapshot } from './task-progress.types'

// Parallel smoke tests for the renderer-side copy of the reducer.
// The exhaustive suite lives next to the main-process original at
// electron/backend/task-progress/task-progress.pure.test.ts — these
// tests guard against drift between the two copies.

describe('applyEvent (renderer)', () => {
  it('creates a fresh snapshot on `started`', () => {
    const snap = applyEvent(null, {
      requestId: 'r1',
      kind: 'started',
      at: 1000,
    })
    expect(snap).toEqual({
      requestId: 'r1',
      startedAt: 1000,
      lastEventAt: 1000,
      stdoutBytes: 0,
      stderrBytes: 0,
      settled: null,
    })
  })

  it('accumulates stdout and stderr bytes independently', () => {
    const base = applyEvent(null, { requestId: 'r2', kind: 'started', at: 0 })
    const afterOut = applyEvent(base, {
      requestId: 'r2',
      kind: 'stdout-chunk',
      at: 100,
      bytes: 10,
    })
    const afterErr = applyEvent(afterOut, {
      requestId: 'r2',
      kind: 'stderr-chunk',
      at: 200,
      bytes: 3,
    })
    expect(afterErr.stdoutBytes).toBe(10)
    expect(afterErr.stderrBytes).toBe(3)
    expect(afterErr.lastEventAt).toBe(200)
  })

  it('records the settled outcome and preserves counters', () => {
    const base: TaskProgressSnapshot = {
      requestId: 'r3',
      startedAt: 0,
      lastEventAt: 50,
      stdoutBytes: 7,
      stderrBytes: 2,
      settled: null,
    }
    const next = applyEvent(base, {
      requestId: 'r3',
      kind: 'settled',
      at: 500,
      outcome: 'error',
    })
    expect(next.settled).toEqual({ at: 500, outcome: 'error' })
    expect(next.stdoutBytes).toBe(7)
    expect(next.stderrBytes).toBe(2)
  })
})
