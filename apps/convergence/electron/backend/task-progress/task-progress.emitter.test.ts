import { describe, expect, it, vi } from 'vitest'
import { createTaskProgressEmitter } from './task-progress.emitter'
import { TaskProgressService } from './task-progress.service'

function makeService(): {
  service: TaskProgressService
  broadcast: ReturnType<typeof vi.fn>
} {
  const broadcast = vi.fn()
  const service = new TaskProgressService(broadcast)
  return { service, broadcast }
}

describe('createTaskProgressEmitter', () => {
  it('returns null when requestId is missing', () => {
    const { service } = makeService()
    expect(createTaskProgressEmitter(undefined, service)).toBeNull()
    expect(createTaskProgressEmitter('', service)).toBeNull()
  })

  it('returns null when service is missing', () => {
    expect(createTaskProgressEmitter('r1', null)).toBeNull()
    expect(createTaskProgressEmitter('r1', undefined)).toBeNull()
  })

  it('emits started/chunks/settled through the service, stamping the clock and requestId', () => {
    const { service, broadcast } = makeService()
    let t = 1000
    const emitter = createTaskProgressEmitter('r1', service, () => ++t)
    if (!emitter) throw new Error('expected emitter')

    emitter.started()
    emitter.stdoutChunk(42)
    emitter.stderrChunk(7)
    emitter.settled('timeout')

    expect(broadcast).toHaveBeenNthCalledWith(1, 'task:progress', {
      requestId: 'r1',
      kind: 'started',
      at: 1001,
    })
    expect(broadcast).toHaveBeenNthCalledWith(2, 'task:progress', {
      requestId: 'r1',
      kind: 'stdout-chunk',
      at: 1002,
      bytes: 42,
    })
    expect(broadcast).toHaveBeenNthCalledWith(3, 'task:progress', {
      requestId: 'r1',
      kind: 'stderr-chunk',
      at: 1003,
      bytes: 7,
    })
    expect(broadcast).toHaveBeenNthCalledWith(4, 'task:progress', {
      requestId: 'r1',
      kind: 'settled',
      at: 1004,
      outcome: 'timeout',
    })
  })
})
