import { describe, expect, it, vi } from 'vitest'
import {
  TaskProgressService,
  TASK_PROGRESS_CHANNEL,
} from './task-progress.service'
import type { TaskProgressEvent } from './task-progress.types'

describe('TaskProgressService', () => {
  it('forwards emitted events to the injected broadcast fn on the task:progress channel', () => {
    const broadcast = vi.fn()
    const service = new TaskProgressService(broadcast)
    const event: TaskProgressEvent = {
      requestId: 'req-1',
      kind: 'started',
      at: 1000,
    }

    service.emit(event)

    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith(TASK_PROGRESS_CHANNEL, event)
  })

  it('passes through every event kind without mutation', () => {
    const broadcast = vi.fn()
    const service = new TaskProgressService(broadcast)
    const events: TaskProgressEvent[] = [
      { requestId: 'req-2', kind: 'started', at: 10 },
      { requestId: 'req-2', kind: 'stdout-chunk', at: 11, bytes: 42 },
      { requestId: 'req-2', kind: 'stderr-chunk', at: 12, bytes: 7 },
      { requestId: 'req-2', kind: 'settled', at: 13, outcome: 'ok' },
    ]

    for (const event of events) {
      service.emit(event)
    }

    expect(broadcast).toHaveBeenCalledTimes(events.length)
    for (let i = 0; i < events.length; i++) {
      expect(broadcast).toHaveBeenNthCalledWith(
        i + 1,
        TASK_PROGRESS_CHANNEL,
        events[i],
      )
    }
  })
})
