import type { TaskProgressEvent } from './task-progress.types'

export const taskProgressApi = {
  subscribe: (callback: (event: TaskProgressEvent) => void): (() => void) =>
    window.electronAPI.taskProgress?.subscribe?.(callback) ?? (() => undefined),
}
