import type {
  TaskProgressEvent,
  TaskProgressSnapshot,
} from './task-progress.types'

export function applyEvent(
  snapshot: TaskProgressSnapshot | null,
  event: TaskProgressEvent,
): TaskProgressSnapshot {
  if (event.kind === 'started') {
    return {
      requestId: event.requestId,
      startedAt: event.at,
      lastEventAt: event.at,
      stdoutBytes: 0,
      stderrBytes: 0,
      settled: null,
    }
  }

  const base: TaskProgressSnapshot = snapshot ?? {
    requestId: event.requestId,
    startedAt: event.at,
    lastEventAt: event.at,
    stdoutBytes: 0,
    stderrBytes: 0,
    settled: null,
  }

  if (event.kind === 'stdout-chunk') {
    return {
      ...base,
      lastEventAt: event.at,
      stdoutBytes: base.stdoutBytes + event.bytes,
    }
  }
  if (event.kind === 'stderr-chunk') {
    return {
      ...base,
      lastEventAt: event.at,
      stderrBytes: base.stderrBytes + event.bytes,
    }
  }
  return {
    ...base,
    lastEventAt: event.at,
    settled: { at: event.at, outcome: event.outcome },
  }
}

export function shouldEvictSnapshot(
  snapshot: TaskProgressSnapshot,
  now: number,
  graceMs: number,
): boolean {
  if (!snapshot.settled) return false
  return now - snapshot.settled.at >= graceMs
}
