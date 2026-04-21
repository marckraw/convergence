import type { TaskProgressService } from './task-progress.service'
import type { TaskProgressOutcome } from './task-progress.types'

export interface TaskProgressEmitter {
  started: () => void
  stdoutChunk: (bytes: number) => void
  stderrChunk: (bytes: number) => void
  settled: (outcome: TaskProgressOutcome) => void
}

export function createTaskProgressEmitter(
  requestId: string | null | undefined,
  service: TaskProgressService | null | undefined,
  clock: () => number = Date.now,
): TaskProgressEmitter | null {
  if (!requestId || !service) return null
  return {
    started: () => {
      service.emit({ requestId, kind: 'started', at: clock() })
    },
    stdoutChunk: (bytes) => {
      service.emit({ requestId, kind: 'stdout-chunk', at: clock(), bytes })
    },
    stderrChunk: (bytes) => {
      service.emit({ requestId, kind: 'stderr-chunk', at: clock(), bytes })
    },
    settled: (outcome) => {
      service.emit({ requestId, kind: 'settled', at: clock(), outcome })
    },
  }
}
