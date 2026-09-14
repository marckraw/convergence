import { afterEach, expect, it, vi } from 'vitest'
import { ProviderAccountLoginService } from './provider-account-login.service'
import type { ProviderAccountInteractiveRunner } from './provider-account-pty-runner'

const target = {
  providerId: 'claude-code' as const,
  accountId: 'acct-fixture',
  kind: 'reconnect' as const,
}
const command = { command: '/fixture/claude', args: ['auth', 'login'], env: {} }
function fixture() {
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
