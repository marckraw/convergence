import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskProgressService } from '../../task-progress/task-progress.service'
import type { TaskProgressEvent } from '../../task-progress/task-progress.types'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { PiProvider } from './pi-provider'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  killed = false
  private exited = false

  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.killed = true
    this.emitExit(0)
    return true
  })

  emitExit(code: number): void {
    if (this.exited) return
    this.exited = true
    this.emit('exit', code)
  }
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

function runPiSummaryServer(child: MockChildProcess, replyText: string): void {
  let buffer = ''
  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line) {
        const message = JSON.parse(line) as { id?: number; type?: string }
        if (message.type === 'prompt') {
          setTimeout(() => {
            child.stdout.write(
              JSON.stringify({
                type: 'response',
                command: 'prompt',
                id: message.id,
                success: true,
              }) + '\n',
            )
            child.stdout.write(JSON.stringify({ type: 'agent_start' }) + '\n')
            child.stdout.write(
              JSON.stringify({
                type: 'message_update',
                assistantMessageEvent: {
                  type: 'text_delta',
                  delta: replyText,
                },
              }) + '\n',
            )
            child.stdout.write(
              JSON.stringify({
                type: 'agent_end',
                messages: [{ role: 'assistant', stopReason: 'stop' }],
              }) + '\n',
            )
          }, 0)
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
}

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('PiProvider.oneShot', () => {
  it('resolves with accumulated text on agent_end', async () => {
    const child = new MockChildProcess()
    runPiSummaryServer(child, 'pi summary output')
    spawnMock.mockReturnValue(child)

    const provider = new PiProvider('/usr/local/bin/pi')
    const result = await provider.oneShot({
      prompt: 'summarize',
      modelId: 'anthropic/claude-3-5-sonnet',
      workingDirectory: '/tmp',
    })

    expect(result.text).toBe('pi summary output')
    const args = spawnMock.mock.calls[0][1] as string[]
    expect(args).toContain('--mode')
    expect(args).toContain('rpc')
    expect(args).toContain('--model')
    expect(args).toContain('anthropic/claude-3-5-sonnet')
  })

  it('omits --model when modelId has no provider prefix', async () => {
    const child = new MockChildProcess()
    runPiSummaryServer(child, 'ok')
    spawnMock.mockReturnValue(child)

    const provider = new PiProvider('/usr/local/bin/pi')
    await provider.oneShot({
      prompt: 'p',
      modelId: 'default',
      workingDirectory: '/tmp',
    })

    const args = spawnMock.mock.calls[0][1] as string[]
    expect(args).not.toContain('--model')
  })

  it('emits started, chunks, and settled:ok on success', async () => {
    const child = new MockChildProcess()
    runPiSummaryServer(child, 'hello')
    spawnMock.mockReturnValue(child)

    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const provider = new PiProvider('/usr/local/bin/pi', service)

    await provider.oneShot({
      prompt: 'hi',
      modelId: 'foo/bar',
      workingDirectory: '/tmp',
      requestId: 'req-ok',
    })

    const kinds = events.map((e) => e.kind)
    expect(kinds[0]).toBe('started')
    expect(kinds.filter((k) => k === 'stdout-chunk').length).toBeGreaterThan(0)
    const settled = events[events.length - 1]
    if (settled.kind !== 'settled') throw new Error('expected settled last')
    expect(settled.outcome).toBe('ok')
  })

  it('emits settled:error and rejects on non-zero exit', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const service = new TaskProgressService(vi.fn())
    const events = captureEmits(service)
    const provider = new PiProvider('/usr/local/bin/pi', service)

    const promise = provider.oneShot({
      prompt: 'hi',
      modelId: 'foo/bar',
      workingDirectory: '/tmp',
      requestId: 'req-err',
    })

    setTimeout(() => child.emit('exit', 1), 0)
    await expect(promise).rejects.toThrow(/exited with code 1/)

    const settled = events.find((e) => e.kind === 'settled')
    if (settled?.kind !== 'settled') throw new Error('bad shape')
    expect(settled.outcome).toBe('error')
  })

  it('rejects when the prompt response is not successful', async () => {
    const child = new MockChildProcess()
    let buffer = ''
    child.stdin.on('data', (chunk) => {
      buffer += chunk.toString()
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) {
          const message = JSON.parse(line) as { id?: number; type?: string }
          if (message.type === 'prompt') {
            setTimeout(() => {
              child.stdout.write(
                JSON.stringify({
                  type: 'response',
                  command: 'prompt',
                  id: message.id,
                  success: false,
                  error: 'bad model',
                }) + '\n',
              )
            }, 0)
          }
        }
        newlineIndex = buffer.indexOf('\n')
      }
    })
    spawnMock.mockReturnValue(child)

    const provider = new PiProvider('/usr/local/bin/pi')
    await expect(
      provider.oneShot({
        prompt: 'hi',
        modelId: 'foo/bar',
        workingDirectory: '/tmp',
      }),
    ).rejects.toThrow(/bad model/)
  })
})
