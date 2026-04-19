import { describe, expect, it, beforeEach, vi } from 'vitest'
import { TerminalService, dataChannel, exitChannel } from './terminal.service'
import type {
  PtyFactory,
  PtyProcess,
  PtySpawnOptions,
  TerminalExitPayload,
} from './terminal.types'

interface FakePty extends PtyProcess {
  emitData(data: string): void
  emitExit(payload: TerminalExitPayload): void
  killed: boolean
  killSignal: string | undefined
  lastWrite: string | null
  lastResize: { cols: number; rows: number } | null
  spawnOptions: PtySpawnOptions
}

function createFakePtyFactory(): {
  factory: PtyFactory
  created: FakePty[]
} {
  const created: FakePty[] = []
  const factory: PtyFactory = {
    spawn(options: PtySpawnOptions): PtyProcess {
      let dataCb: ((d: string) => void) | null = null
      let exitCb: ((p: TerminalExitPayload) => void) | null = null
      const fake: FakePty = {
        pid: 4242 + created.length,
        spawnOptions: options,
        killed: false,
        killSignal: undefined,
        lastWrite: null,
        lastResize: null,
        write: (data) => {
          fake.lastWrite = data
        },
        resize: (cols, rows) => {
          fake.lastResize = { cols, rows }
        },
        kill: (signal) => {
          fake.killed = true
          fake.killSignal = signal
        },
        onData: (cb) => {
          dataCb = cb
          return {
            dispose: () => {
              dataCb = null
            },
          }
        },
        onExit: (cb) => {
          exitCb = cb
          return {
            dispose: () => {
              exitCb = null
            },
          }
        },
        emitData: (data) => dataCb?.(data),
        emitExit: (payload) => exitCb?.(payload),
      }
      created.push(fake)
      return fake
    },
  }
  return { factory, created }
}

describe('TerminalService', () => {
  let factory: PtyFactory
  let created: FakePty[]
  let emit: ReturnType<typeof vi.fn>
  let service: TerminalService

  beforeEach(() => {
    const built = createFakePtyFactory()
    factory = built.factory
    created = built.created
    emit = vi.fn()
    service = new TerminalService(factory, emit, {
      SHELL: '/bin/zsh',
    })
  })

  it('spawns a pty on create with cwd, cols, rows', () => {
    const result = service.create({
      sessionId: 's1',
      cwd: '/tmp/project',
      cols: 80,
      rows: 24,
    })

    expect(result.pid).toBe(4242)
    expect(result.shell).toBe('/bin/zsh')
    expect(result.initialBuffer).toBe('')
    expect(created[0].spawnOptions).toMatchObject({
      shell: '/bin/zsh',
      args: ['-l'],
      cwd: '/tmp/project',
      cols: 80,
      rows: 24,
    })
    expect(service.has(result.id)).toBe(true)
  })

  it('emits data chunks on the correct channel', () => {
    const { id } = service.create({
      sessionId: 's1',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    })
    created[0].emitData('hello')
    expect(emit).toHaveBeenCalledWith(dataChannel(id), 'hello')
  })

  it('attach replays the accumulated ring buffer', () => {
    const { id } = service.create({
      sessionId: 's1',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    })
    created[0].emitData('foo')
    created[0].emitData('bar')
    expect(service.attach(id).initialBuffer).toBe('foobar')
  })

  it('attach returns empty buffer for unknown id', () => {
    expect(service.attach('missing').initialBuffer).toBe('')
  })

  it('write forwards to the pty', () => {
    const { id } = service.create({
      sessionId: 's1',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    })
    service.write(id, 'ls\n')
    expect(created[0].lastWrite).toBe('ls\n')
  })

  it('write is a noop for unknown id', () => {
    expect(() => service.write('missing', 'x')).not.toThrow()
  })

  it('resize forwards to the pty and floors fractional sizes', () => {
    const { id } = service.create({
      sessionId: 's1',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    })
    service.resize(id, 100.7, 30.2)
    expect(created[0].lastResize).toEqual({ cols: 100, rows: 30 })
  })

  it('resize clamps non-positive sizes to 1', () => {
    const { id } = service.create({
      sessionId: 's1',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    })
    service.resize(id, 0, -5)
    expect(created[0].lastResize).toEqual({ cols: 1, rows: 1 })
  })

  it('dispose kills the pty and removes the handle', () => {
    const { id } = service.create({
      sessionId: 's1',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    })
    service.dispose(id)
    expect(created[0].killed).toBe(true)
    expect(service.has(id)).toBe(false)
  })

  it('dispose is idempotent', () => {
    const { id } = service.create({
      sessionId: 's1',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    })
    service.dispose(id)
    expect(() => service.dispose(id)).not.toThrow()
  })

  it('pty exit emits the exit channel and cleans up the handle', () => {
    const { id } = service.create({
      sessionId: 's1',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    })
    created[0].emitExit({ exitCode: 0, signal: null })
    expect(emit).toHaveBeenCalledWith(exitChannel(id), {
      exitCode: 0,
      signal: null,
    })
    expect(service.has(id)).toBe(false)
  })

  it('disposeAll kills every handle', () => {
    const a = service.create({
      sessionId: 's',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    })
    const b = service.create({
      sessionId: 's',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
    })
    expect(service.size()).toBe(2)
    service.disposeAll()
    expect(service.size()).toBe(0)
    expect(created[0].killed).toBe(true)
    expect(created[1].killed).toBe(true)
    expect(a.id).not.toBe(b.id)
  })

  it('floors fractional initial cols and rows on create', () => {
    service.create({
      sessionId: 's1',
      cwd: '/tmp',
      cols: 80.9,
      rows: 24.3,
    })
    expect(created[0].spawnOptions.cols).toBe(80)
    expect(created[0].spawnOptions.rows).toBe(24)
  })

  it('falls back to /bin/zsh when SHELL missing', () => {
    const svc = new TerminalService(factory, emit, {})
    const res = svc.create({ sessionId: 's', cwd: '/tmp', cols: 80, rows: 24 })
    expect(res.shell).toBe('/bin/zsh')
  })
})
