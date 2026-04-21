import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskProgressService } from '../../task-progress/task-progress.service'
import type { TaskProgressEvent } from '../../task-progress/task-progress.types'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { ClaudeCodeProvider } from './claude-code-provider'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    return true
  })
}

function captureEmits(service: TaskProgressService): TaskProgressEvent[] {
  const events: TaskProgressEvent[] = []
  const original = service.emit.bind(service)
  vi.spyOn(service, 'emit').mockImplementation((event: TaskProgressEvent) => {
    events.push(event)
    original(event)
  })
  return events
}

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('ClaudeCodeProvider.oneShot progress emission', () => {
  it('emits nothing when requestId is absent', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const broadcast = vi.fn()
    const service = new TaskProgressService(broadcast)
    const provider = new ClaudeCodeProvider('/bin/claude', service)

    const promise = provider.oneShot({
      prompt: 'hello',
      modelId: 'sonnet',
      workingDirectory: '/tmp',
    })

    child.stdout.write(Buffer.from('{"result":"ok"}'))
    child.stdout.end()
    child.emit('exit', 0)

    await promise
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('emits started, stdout chunks, and settled:ok on success', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const provider = new ClaudeCodeProvider('/bin/claude', service)

    const promise = provider.oneShot({
      prompt: 'hello',
      modelId: 'sonnet',
      workingDirectory: '/tmp',
      requestId: 'req-success',
    })

    child.stdout.write(Buffer.from('{"resu'))
    child.stdout.write(Buffer.from('lt":"ok"}'))
    child.stdout.end()
    child.emit('exit', 0)

    const result = await promise
    expect(result.text).toBe('ok')

    const kinds = events.map((e) => e.kind)
    expect(kinds[0]).toBe('started')
    expect(kinds[kinds.length - 1]).toBe('settled')
    expect(kinds.filter((k) => k === 'stdout-chunk').length).toBe(2)

    const settled = events[events.length - 1]
    if (settled.kind !== 'settled') throw new Error('expected settled last')
    expect(settled.outcome).toBe('ok')
    expect(settled.requestId).toBe('req-success')
  })

  it('emits settled:error when the child exits non-zero', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const provider = new ClaudeCodeProvider('/bin/claude', service)

    const promise = provider.oneShot({
      prompt: 'hello',
      modelId: 'sonnet',
      workingDirectory: '/tmp',
      requestId: 'req-fail',
    })

    child.stderr.write(Buffer.from('boom'))
    child.stderr.end()
    child.emit('exit', 2)

    await expect(promise).rejects.toThrow(/exited with code 2/)

    const settled = events.find((e) => e.kind === 'settled')
    expect(settled).toBeDefined()
    if (settled?.kind !== 'settled') throw new Error('bad shape')
    expect(settled.outcome).toBe('error')

    expect(events.some((e) => e.kind === 'stderr-chunk')).toBe(true)
  })

  it('emits settled:timeout when the timeout fires before exit', async () => {
    vi.useFakeTimers()
    try {
      const child = new MockChildProcess()
      spawnMock.mockReturnValue(child)

      const service = new TaskProgressService(vi.fn())
      const events = captureEmits(service)
      const provider = new ClaudeCodeProvider('/bin/claude', service)

      const promise = provider.oneShot({
        prompt: 'hello',
        modelId: 'sonnet',
        workingDirectory: '/tmp',
        timeoutMs: 50,
        requestId: 'req-timeout',
      })
      promise.catch(() => {})

      await vi.advanceTimersByTimeAsync(60)

      await expect(promise).rejects.toThrow(/timed out/)
      const settled = events.find((e) => e.kind === 'settled')
      if (settled?.kind !== 'settled') throw new Error('bad shape')
      expect(settled.outcome).toBe('timeout')
    } finally {
      vi.useRealTimers()
    }
  })
})
