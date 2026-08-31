import type { TaskProgressEvent } from './task-progress.types'

export const TASK_PROGRESS_CHANNEL = 'task:progress'

export type BroadcastFn = (channel: string, payload: unknown) => void

export class TaskProgressService {
  private readonly broadcast: BroadcastFn

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast
  }

  emit(event: TaskProgressEvent): void {
    this.broadcast(TASK_PROGRESS_CHANNEL, event)
  }
}
