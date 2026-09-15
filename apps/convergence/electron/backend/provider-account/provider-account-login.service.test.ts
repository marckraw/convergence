import { afterEach, expect, it, vi } from 'vitest'
import {
  ProviderAccountLoginService,
  type ProviderAccountTimers,
} from './provider-account-login.service'
import type { ProviderAccountInteractiveRunner } from './provider-account-pty-runner'

const target = {
  providerId: 'claude-code' as const,
  accountId: 'acct-fixture',
  kind: 'reconnect' as const,
}
const command = { command: '/fixture/claude', args: ['auth', 'login'], env: {} }

/** A fully manual clock: timers fire only when `advance` says so, so no test
 * ever waits in real time for a timeout or deadline. */
function manualTimers() {
  const pending = new Map<
    object,
    { handler: () => void; dueAt: number; unref: ReturnType<typeof vi.fn> }
  >()
  const armed: Array<{ unref: ReturnType<typeof vi.fn> }> = []
  let now = 0
  const timers: ProviderAccountTimers = {
    setTimeout: (handler, timeoutMs) => {
      const unref = vi.fn()
      const handle = { unref }
      pending.set(handle, { handler, dueAt: now + timeoutMs, unref })
      armed.push({ unref })
      return handle
    },
    clearTimeout: (handle) => {
      if (handle) pending.delete(handle)
    },
  }
  const advance = (ms: number) => {
    now += ms
    for (const [handle, entry] of [...pending]) {
      if (entry.dueAt <= now) {
        pending.delete(handle)
        entry.handler()
      }
    }
  }
  return { timers, advance, armed }
}

function fixture(extra: { timers?: ProviderAccountTimers } = {}) {
  let lifecycle!: NonNullable<Parameters<ProviderAccountInteractiveRunner>[1]>
  let exit!: (value: { code: number; output: string }) => void
  const runner = vi.fn<ProviderAccountInteractiveRunner>(
    (_command, control) => {
      lifecycle = control!
      return new Promise((resolve) => {
        exit = resolve
      })
    },
  )
  const service = new ProviderAccountLoginService({
    runner,
    timeoutMs: 1000,
    newId: () => 'attempt-fixture',
    ...extra,
  })
  return {
    service,
    runner,
    control: () => lifecycle,
    exit: (code = 0) => exit({ code, output: 'token=secret-fixture' }),
  }
}
afterEach(() => vi.useRealTimers())

it('owns a single attempt across readers and exposes only classified progress', async () => {
  const f = fixture()
  const result = f.service.run(target, () => f.service.runLoginCommand(command))
  const write = vi.fn()
  f.control().onInputReady?.(write)
  f.control().onData?.(
    'https://claude.com/cai/oauth/authorize?state=fixture\nPaste the authorization code:',
  )
  expect(f.service.getAttempt()).toMatchObject({
    id: 'attempt-fixture',
    state: 'waiting-code',
    active: true,
  })
  const snapshot = f.service.getAttempt()!
  snapshot.active = false
  expect(f.service.getAttempt()?.active).toBe(true)
  await expect(
    f.service.run({ ...target, providerId: 'codex' }, async () => {}),
  ).rejects.toThrow(/already in progress/)
  f.service.submitCode('attempt-fixture', ' secret-fixture#state ')
  expect(write).toHaveBeenCalledWith('secret-fixture#state\r')
  expect(JSON.stringify(f.service.getAttempt())).not.toContain('secret-fixture')
  expect(() => f.service.submitCode('attempt-fixture', 'again')).toThrow(
    /not waiting/,
  )
  f.exit()
  expect(await result).toEqual({ code: 0, stdout: '', stderr: '' })
  expect(f.service.getAttempt()).toMatchObject({
    state: 'completed',
    active: false,
    authorizationUrl: null,
  })
})

it('keeps cancellation active until the child exits and cleanup finishes, then permits retry', async () => {
  const f = fixture()
  let finishCleanup!: () => void
  const result = f.service.run(target, async () => {
    try {
      await f.service.runLoginCommand(command)
    } finally {
      await new Promise<void>((resolve) => {
        finishCleanup = resolve
      })
    }
  })
  const observed = result.catch((error) => error.message)
  f.service.cancel('wrong-attempt')
  expect(f.control().signal?.aborted).toBe(false)
  f.service.cancel('attempt-fixture')
  expect(f.control().signal?.aborted).toBe(true)
  expect(f.service.getAttempt()).toMatchObject({
    state: 'cancelling',
    active: true,
  })
  f.exit(129)
  await vi.waitFor(() => expect(finishCleanup).toBeTypeOf('function'))
  expect(f.service.getAttempt()?.active).toBe(true)
  finishCleanup()
  expect(await observed).toBe('Sign-in cancelled.')
  expect(f.service.getAttempt()).toMatchObject({
    state: 'cancelled',
    active: false,
  })
  const retry = f.service.run(target, () => f.service.runLoginCommand(command))
  f.exit()
  await retry
  expect(f.runner).toHaveBeenCalledTimes(2)
})

it('reports timeout only after exit and keeps a failed discard more important than cancellation', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const result = f.service
    .run(target, async () => {
      await f.service.runLoginCommand(command).catch(() => {})
      throw new Error('Claude sign-out failed: secret-fixture')
    })
    .catch((error) => error.message)
  await vi.advanceTimersByTimeAsync(1000)
  expect(f.service.getAttempt()).toMatchObject({
    state: 'cancelling',
    active: true,
  })
  f.exit(129)
  expect(await result).toContain('could not be discarded')
  expect(f.service.getAttempt()).toMatchObject({
    state: 'failed',
    active: false,
  })
  expect(JSON.stringify(f.service.getAttempt())).not.toContain('secret-fixture')
})

it('times out with no raw output and remembers cancellation before the child starts', async () => {
  vi.useFakeTimers()
  const f = fixture()
  let prepared!: () => void
  const result = f.service
    .run(target, async () => {
      await new Promise<void>((resolve) => {
        prepared = resolve
      })
      return f.service.runLoginCommand(command)
    })
    .catch((error) => error.message)
  await vi.advanceTimersByTimeAsync(1000)
  prepared()
  expect(await result).toMatch(/timed out/)
  expect(f.runner).not.toHaveBeenCalled()
  expect(f.service.getAttempt()?.state).toBe('timed-out')
})

it('does not let a closed renderer change the outcome and waits for cleanup on app shutdown', async () => {
  const f = fixture()
  f.service.subscribe(() => {
    throw new Error('closed renderer')
  })
  const result = f.service
    .run(target, () => f.service.runLoginCommand(command))
    .catch((error) => error.message)
  let stopped = false
  const shutdown = f.service.shutdown().then(() => {
    stopped = true
  })
  expect(stopped).toBe(false)
  f.exit(129)
  await shutdown
  expect(await result).toBe('Sign-in cancelled.')
  expect(stopped).toBe(true)
})

it('cannot cancel once the child has exited and identity verification is finishing', async () => {
  const f = fixture()
  let verified!: () => void
  const result = f.service.run(target, async () => {
    await f.service.runLoginCommand(command)
    await new Promise<void>((resolve) => {
      verified = resolve
    })
  })
  f.exit()
  await vi.waitFor(() => expect(verified).toBeTypeOf('function'))
  expect(f.service.getAttempt()?.state).toBe('finishing')
  f.service.cancel('attempt-fixture')
  expect(f.control().signal?.aborted).toBe(false)
  verified()
  await result
})

it('bounds app shutdown without pretending stalled cleanup completed', async () => {
  vi.useFakeTimers()
  const f = fixture()
  let finishCleanup!: () => void
  const result = f.service.run(target, async () => {
    await f.service.runLoginCommand(command)
    await new Promise<void>((resolve) => {
      finishCleanup = resolve
    })
  })
  f.exit()
  await vi.advanceTimersByTimeAsync(0)
  expect(f.service.getAttempt()?.state).toBe('finishing')
  let stopped = false
  const shutdown = f.service.shutdown().then(() => {
    stopped = true
  })
  await vi.advanceTimersByTimeAsync(29_999)
  expect(stopped).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await shutdown
  expect(stopped).toBe(true)
  expect(f.service.getAttempt()?.active).toBe(true)
  finishCleanup()
  await result
  expect(f.service.getAttempt()?.state).toBe('completed')
})

it('times an attempt out through the injected timer source with no real waiting', async () => {
  const { timers, advance } = manualTimers()
  const f = fixture({ timers })
  let prepared!: () => void
  const result = f.service
    .run(target, async () => {
      await new Promise<void>((resolve) => {
        prepared = resolve
      })
      return f.service.runLoginCommand(command)
    })
    .catch((error) => error.message)
  await vi.waitFor(() => expect(prepared).toBeTypeOf('function'))
  advance(1000)
  expect(f.service.getAttempt()).toMatchObject({
    state: 'cancelling',
    active: true,
  })
  prepared()
  expect(await result).toMatch(/timed out/)
  expect(f.service.getAttempt()).toMatchObject({
    state: 'timed-out',
    active: false,
  })
})

it('bounds shutdown to its 30-second deadline through the injected timer source', async () => {
  const { timers, advance } = manualTimers()
  const f = fixture({ timers })
  const result = f.service
    .run(target, () => f.service.runLoginCommand(command))
    .catch((error) => error.message)
  let stopped = false
  const shutdown = f.service.shutdown().then(() => {
    stopped = true
  })
  expect(stopped).toBe(false)
  advance(30_000)
  await shutdown
  expect(stopped).toBe(true)
  // The deadline expired, not the cleanup: the attempt is still finishing.
  expect(f.service.getAttempt()?.active).toBe(true)
  f.exit(129)
  expect(await result).toBe('Sign-in cancelled.')
})

it('preserves unref on every timer it arms through the injected source', async () => {
  const { timers, advance, armed } = manualTimers()
  const f = fixture({ timers })
  const result = f.service
    .run(target, () => f.service.runLoginCommand(command))
    .catch(() => {})
  // The attempt timeout is unref'd the moment it is armed.
  await vi.waitFor(() => expect(armed.length).toBe(1))
  expect(armed[0].unref).toHaveBeenCalled()
  let stopped = false
  const shutdown = f.service.shutdown().then(() => {
    stopped = true
  })
  // The shutdown deadline is armed and unref'd too.
  await vi.waitFor(() => expect(armed.length).toBe(2))
  expect(armed[1].unref).toHaveBeenCalled()
  advance(30_000)
  await shutdown
  expect(stopped).toBe(true)
  f.exit()
  await result
  expect(f.service.getAttempt()?.state).toBe('cancelled')
})
