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
import { CodexServerHostRegistry } from './codex-server-host'

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

/**
 * oneShot still runs `codex exec` as its own process (CX2-3 moves it onto the
 * server), so these tests keep mocking `spawn`. The registry is here only
 * because the provider requires one — nothing in this file connects to it.
 */
function createOneShotRegistry(): CodexServerHostRegistry {
  const registry = new CodexServerHostRegistry({ appVersion: '0.46.13' })
  registry.setBinary('/usr/local/bin/codex', '0.153.4')
  return registry
}

describe('CodexProvider.oneShot progress emission', () => {
  it('passes approval policy through config for current Codex exec', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/bin/codex', createOneShotRegistry())

    const promise = provider.oneShot({
      prompt: 'hi',
      modelId: 'gpt-5',
      workingDirectory: '/tmp',
    })

    child.stdout.end()
    child.emit('exit', 0)

    await promise
    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/codex',
      [
        'exec',
        '--skip-git-repo-check',
        '--model',
        'gpt-5',
        '-c',
        'approval_policy="on-request"',
        '--sandbox',
        'workspace-write',
        'hi',
      ],
      expect.objectContaining({
        cwd: '/tmp',
      }),
    )
    expect(spawnMock.mock.calls[0][1]).not.toContain('--ask-for-approval')
  })

  it('passes one-shot effort through config for Codex exec', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/bin/codex', createOneShotRegistry())

    const promise = provider.oneShot({
      prompt: 'hi',
      modelId: 'gpt-5.5',
      effort: 'medium',
      workingDirectory: '/tmp',
    })

    child.stdout.end()
    child.emit('exit', 0)

    await promise
    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/codex',
      expect.arrayContaining([
        '--model',
        'gpt-5.5',
        '-c',
        'model_reasoning_effort="medium"',
      ]),
      expect.objectContaining({
        cwd: '/tmp',
      }),
    )
  })

  it('passes one-shot service tier through config for Codex exec', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const provider = new CodexProvider('/bin/codex', createOneShotRegistry())

    const promise = provider.oneShot({
      prompt: 'hi',
      modelId: 'gpt-5.5',
      serviceTier: 'fast',
      workingDirectory: '/tmp',
    })

    child.stdout.end()
    child.emit('exit', 0)

    await promise
    expect(spawnMock).toHaveBeenCalledWith(
      '/bin/codex',
      expect.arrayContaining(['-c', 'service_tier="fast"']),
      expect.objectContaining({
        cwd: '/tmp',
      }),
    )
  })

  it('emits nothing when requestId is absent', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const broadcast = vi.fn()
    const service = new TaskProgressService(broadcast)
    const provider = new CodexProvider(
      '/bin/codex',
      createOneShotRegistry(),
      service,
    )

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
    const provider = new CodexProvider(
      '/bin/codex',
      createOneShotRegistry(),
      service,
    )

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
    const provider = new CodexProvider(
      '/bin/codex',
      createOneShotRegistry(),
      service,
    )

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
