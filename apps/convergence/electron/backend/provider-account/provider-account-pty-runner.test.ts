import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PtyFactory, PtySpawnOptions } from '../terminal/terminal.types'
import { createPtyCommandRunner } from './provider-account-pty-runner'

/**
 * The fake PTY seam: same discipline as the fake command spawners, so nothing
 * here touches node-pty, a real binary, or a real terminal.
 */
function fakePty() {
  const spawns: PtySpawnOptions[] = []
  const dataHandlers: ((data: string) => void)[] = []
  const exitHandlers: ((payload: {
    exitCode: number
    signal: number | null
  }) => void)[] = []
  const disposed: string[] = []
  const kill = vi.fn()
  const write = vi.fn()

  const factory: PtyFactory = {
    spawn(options) {
      spawns.push(options)
      return {
        pid: 4242,
        write,
        resize: vi.fn(),
        kill,
        onData(cb) {
          dataHandlers.push(cb)
          return { dispose: () => disposed.push('data') }
        },
        onExit(cb) {
          exitHandlers.push(cb)
          return { dispose: () => disposed.push('exit') }
        },
      }
    },
  }

  return {
    factory,
    spawns,
    disposed,
    kill,
    write,
    emit: (data: string) => dataHandlers.forEach((cb) => cb(data)),
    exit: (exitCode: number) =>
      exitHandlers.forEach((cb) => cb({ exitCode, signal: null })),
  }
}

const LOGIN_COMMAND = {
  command: '/usr/local/bin/claude',
  args: ['mcp', 'login', 'atlassian'],
  env: { PATH: '/usr/local/bin', CLAUDE_CONFIG_DIR: '/accounts/acct-a' },
  cwd: '/repo',
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createPtyCommandRunner', () => {
  it('runs the command on a terminal, with its own environment and directory', async () => {
    // The whole point of the phase: a terminal, not a pipe, and still the
    // account's environment — tokens must land in the selected slot.
    const pty = fakePty()
    const run = createPtyCommandRunner({ ptyFactory: pty.factory })

    const result = run(LOGIN_COMMAND)
    pty.exit(0)
    await result

    expect(pty.spawns[0].shell).toBe('/usr/local/bin/claude')
    expect(pty.spawns[0].args).toEqual(['mcp', 'login', 'atlassian'])
    expect(pty.spawns[0].cwd).toBe('/repo')
    expect(pty.spawns[0].env.CLAUDE_CONFIG_DIR).toBe('/accounts/acct-a')
  })

  it('gives the command a terminal wide enough to print into', async () => {
    const pty = fakePty()

    const result = createPtyCommandRunner({ ptyFactory: pty.factory })(
      LOGIN_COMMAND,
    )
    pty.exit(0)
    await result

    expect(pty.spawns[0].cols).toBeGreaterThanOrEqual(80)
    expect(pty.spawns[0].rows).toBeGreaterThanOrEqual(24)
  })

  it('returns the exit code with everything the terminal showed', async () => {
    const pty = fakePty()

    const result = createPtyCommandRunner({ ptyFactory: pty.factory })(
      LOGIN_COMMAND,
    )
    pty.emit('opening browser\n')
    pty.emit('authorized\n')
    pty.exit(0)

    expect(await result).toEqual({
      code: 0,
      output: 'opening browser\nauthorized\n',
    })
  })

  it('stops listening once the command is done', async () => {
    // A handler outliving its process is how the tunnel ghost was born; this
    // runner disposes both subscriptions on the way out.
    const pty = fakePty()

    const result = createPtyCommandRunner({ ptyFactory: pty.factory })(
      LOGIN_COMMAND,
    )
    pty.exit(0)
    await result

    expect(pty.disposed.sort()).toEqual(['data', 'exit'])
  })

  it('rejects when the terminal cannot be opened at all', async () => {
    const factory: PtyFactory = {
      spawn() {
        throw new Error('posix_openpt failed')
      },
    }

    await expect(
      createPtyCommandRunner({ ptyFactory: factory })(LOGIN_COMMAND),
    ).rejects.toThrow(/posix_openpt failed/)
  })

  it('kills a ceremony nobody finished, and says what it last saw', async () => {
    vi.useFakeTimers()
    const pty = fakePty()
    const onExitConfirmed = vi.fn()

    const result = createPtyCommandRunner({
      ptyFactory: pty.factory,
      timeoutMs: 1000,
    })(LOGIN_COMMAND, { onExitConfirmed })
    const assertion = expect(result).rejects.toThrow(
      /timed out after 1s; last output was: waiting for the browser/,
    )
    pty.emit('waiting for the browser\n')
    await vi.advanceTimersByTimeAsync(1001)
    await assertion

    expect(pty.kill).toHaveBeenCalled()
    expect(onExitConfirmed).not.toHaveBeenCalled()
    expect(pty.disposed).toEqual(['data'])
    pty.exit(1)
    expect(onExitConfirmed).toHaveBeenCalledTimes(1)
    expect(pty.disposed.sort()).toEqual(['data', 'exit'])
  })

  it('does not go looking for a process that already exited', async () => {
    // The timer outliving its process is the shape that produces a kill on a
    // dead pid — and, elsewhere in this repo, load-only test ghosts.
    vi.useFakeTimers()
    const pty = fakePty()

    const result = createPtyCommandRunner({
      ptyFactory: pty.factory,
      timeoutMs: 1000,
    })(LOGIN_COMMAND)
    pty.exit(0)
    await result
    await vi.advanceTimersByTimeAsync(5000)

    expect(pty.kill).not.toHaveBeenCalled()
  })

  it('escalates a ceremony that ignores the first signal and confirms only its actual exit', async () => {
    vi.useFakeTimers()
    const pty = fakePty()
    pty.kill.mockImplementation((signal) => {
      if (signal === 'SIGKILL') pty.exit(1)
    })
    const onExitConfirmed = vi.fn()
    const result = createPtyCommandRunner({
      ptyFactory: pty.factory,
      timeoutMs: 1000,
    })(LOGIN_COMMAND, { onExitConfirmed })
    const failure = expect(result).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(1000)
    await failure
    expect(onExitConfirmed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(pty.kill).toHaveBeenCalledWith('SIGKILL')
    expect(onExitConfirmed).toHaveBeenCalledTimes(1)
  })
})

it('cancels a login, escalates, and waits for exit before rejecting without raw output', async () => {
  vi.useFakeTimers()
  const pty = fakePty()
  const controller = new AbortController()
  const exitConfirmed = vi.fn()
  let write!: (value: string) => void
  const result = createPtyCommandRunner({ ptyFactory: pty.factory })(
    LOGIN_COMMAND,
    {
      onExitConfirmed: exitConfirmed,
      signal: controller.signal,
      awaitExitOnTimeout: true,
      redactOutput: true,
      onInputReady: (value) => {
        write = value
      },
    },
  )
  let settled = false
  const observed = result.catch((error) => {
    settled = true
    return error.message
  })
  pty.emit('token=secret-fixture')
  write('fixture-code\r')
  expect(pty.write).toHaveBeenCalledWith('fixture-code\r')
  controller.abort()
  expect(pty.kill).toHaveBeenCalledTimes(1)
  write('ignored')
  expect(pty.write).toHaveBeenCalledTimes(1)
  expect(settled).toBe(false)
  expect(exitConfirmed).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(5000)
  expect(pty.kill).toHaveBeenCalledWith('SIGKILL')
  expect(settled).toBe(false)
  pty.exit(137)
  expect(await observed).toBe('Sign-in cancelled.')
  expect(exitConfirmed).toHaveBeenCalledTimes(1)
  expect(pty.disposed.sort()).toEqual(['data', 'exit'])
})

it('never returns a login transcript on success and aborts before spawn', async () => {
  const pty = fakePty()
  const run = createPtyCommandRunner({ ptyFactory: pty.factory })
  const result = run(LOGIN_COMMAND, {
    onExitConfirmed: () => {},
    redactOutput: true,
    awaitExitOnTimeout: true,
  })
  pty.emit('secret-fixture')
  pty.exit(0)
  expect(await result).toEqual({ code: 0, output: '' })
  const controller = new AbortController()
  controller.abort()
  await expect(
    run(LOGIN_COMMAND, {
      onExitConfirmed: () => {},
      signal: controller.signal,
    }),
  ).rejects.toThrow(/cancelled/)
  expect(pty.spawns).toHaveLength(1)
})
