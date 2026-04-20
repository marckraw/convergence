import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskProgressService } from '../../task-progress/task-progress.service'
import type { TaskProgressEvent } from '../../task-progress/task-progress.types'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CodexProvider } from './codex-provider'

class MockChildProcess extends EventEmitter {
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

describe('CodexProvider.oneShot progress emission', () => {
  it('emits nothing when requestId is absent', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const broadcast = vi.fn()
    const service = new TaskProgressService(broadcast)
    const provider = new CodexProvider('/bin/codex', service)

    const promise = provider.oneShot({
      prompt: 'hi',
      modelId: 'gpt-5',
      workingDirectory: '/tmp',
    })

    child.stdout.write(Buffer.from('hello world'))
    child.stdout.end()
    child.emit('exit', 0)

    await promise
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('emits started, chunks, and settled:ok on success', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const provider = new CodexProvider('/bin/codex', service)

    const promise = provider.oneShot({
      prompt: 'hi',
      modelId: 'gpt-5',
      workingDirectory: '/tmp',
      requestId: 'req-ok',
    })

    child.stdout.write(Buffer.from('partial '))
    child.stdout.write(Buffer.from('output'))
    child.stdout.end()
    child.emit('exit', 0)

    await promise
    const kinds = events.map((e) => e.kind)
    expect(kinds[0]).toBe('started')
    expect(kinds.filter((k) => k === 'stdout-chunk').length).toBe(2)
    const settled = events[events.length - 1]
    if (settled.kind !== 'settled') throw new Error('expected settled last')
    expect(settled.outcome).toBe('ok')
  })

  it('emits settled:error on non-zero exit', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const provider = new CodexProvider('/bin/codex', service)

    const promise = provider.oneShot({
      prompt: 'hi',
      modelId: 'gpt-5',
      workingDirectory: '/tmp',
      requestId: 'req-err',
    })

    child.emit('exit', 1)
    await expect(promise).rejects.toThrow(/exited with code 1/)

    const settled = events.find((e) => e.kind === 'settled')
    if (settled?.kind !== 'settled') throw new Error('bad shape')
    expect(settled.outcome).toBe('error')
  })
})
