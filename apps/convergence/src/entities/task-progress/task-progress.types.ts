// Duplicated from electron/backend/task-progress/task-progress.types.ts.
// The renderer tsconfig cannot import from electron/; keep the shapes in
// sync by hand. Any change here must also be made on the main-process side.

export type TaskProgressOutcome = 'ok' | 'error' | 'timeout'

export type TaskProgressEvent =
  | { requestId: string; kind: 'started'; at: number }
  | { requestId: string; kind: 'stdout-chunk'; at: number; bytes: number }
  | { requestId: string; kind: 'stderr-chunk'; at: number; bytes: number }
  | {
      requestId: string
      kind: 'settled'
      at: number
      outcome: TaskProgressOutcome
    }

export interface TaskProgressSnapshot {
  requestId: string
  startedAt: number
  lastEventAt: number
  stdoutBytes: number
  stderrBytes: number
  settled: null | { at: number; outcome: TaskProgressOutcome }
}

export interface TaskProgressView {
  elapsedMs: number
  msSinceLastEvent: number
  settled: null | { at: number; outcome: TaskProgressOutcome }
}
