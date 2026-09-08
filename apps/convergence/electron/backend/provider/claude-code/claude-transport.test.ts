import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { expect, it, vi } from 'vitest'
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', () => ({ spawn: spawnMock }))
import { createClaudeTransport } from './claude-transport.service'

it('uses the chosen executable and exposes stderr once and exit — substitute the binary, duplicate stderr or hide exit turns red', async () => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    killed: false,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(() => true),
  })
  child.stdin.on('data', (chunk) => {
    for (const line of String(chunk).trim().split('\n')) {
      const e = JSON.parse(line)
      if (e.type === 'control_request')
        child.stdout.write(
          JSON.stringify({
            type: 'control_response',
            response: {
              subtype: 'success',
              request_id: e.request_id,
              response: {},
            },
          }) + '\n',
        )
    }
  })
  spawnMock.mockReturnValue(child)
  const stderr = vi.fn(),
    exit = vi.fn(),
    message = vi.fn()
  const transport = createClaudeTransport({
    binaryPath: '/chosen/claude',
    args: [],
    cwd: '/tmp',
    env: {},
    onMessage: message,
    onExit: exit,
    onStderr: stderr,
  })
  child.stderr.write('fixture stderr')
  Object.assign(child, { exitCode: 3 })
  child.emit('exit', 3, null)
  child.stdout.end()
  child.stderr.end()
  await vi.waitFor(() =>
    expect({
      binary: spawnMock.mock.calls[0]?.[0],
      stderr: stderr.mock.calls,
      exit: exit.mock.calls.map((c) => ({
        code: c[0].code,
        signal: c[0].signal,
      })),
    }).toEqual({
      binary: '/chosen/claude',
      stderr: [['fixture stderr']],
      exit: [{ code: 3, signal: null }],
    }),
  )
  transport.close()
})

it('serializes model, permission and interrupt controls and returns the receipt — drop permission control turns red', async () => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    killed: false,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(() => true),
  })
  const requests: Array<{ subtype: string }> = []
  child.stdin.on('data', (chunk) => {
    for (const line of String(chunk).trim().split('\n')) {
      const e = JSON.parse(line)
      if (e.type === 'control_request') {
        requests.push(e.request)
        child.stdout.write(
          JSON.stringify({
            type: 'control_response',
            response: {
              subtype: 'success',
              request_id: e.request_id,
              response: { still_queued: [] },
            },
          }) + '\n',
        )
      }
    }
  })
  spawnMock.mockReset().mockReturnValue(child)
  const transport = createClaudeTransport({
    binaryPath: '/chosen/claude',
    args: [],
    cwd: '/tmp',
    env: {},
    onMessage: () => {},
    onExit: () => {},
    onStderr: () => {},
  })
  try {
    await transport.setModel('fixture-model')
    await transport.setPermissionMode('plan')
    const receipt = await transport.interrupt()
    expect({
      controls: requests.filter((r) => r.subtype !== 'initialize'),
      receipt,
    }).toEqual({
      controls: [
        { subtype: 'set_model', model: 'fixture-model' },
        { subtype: 'set_permission_mode', mode: 'plan' },
        { subtype: 'interrupt' },
      ],
      receipt: { still_queued: [] },
    })
  } finally {
    child.emit('exit', 0, null)
    child.stdout.end()
    await transport.close()
  }
})
