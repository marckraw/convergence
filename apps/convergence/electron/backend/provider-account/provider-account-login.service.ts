import { randomUUID } from 'crypto'
import type { ProviderAccountLoginAttempt } from '../../../src/shared/types/provider-account-login.types'
import type { ProviderAccountCommandRunner } from './provider-account-enrolment.service'
import type { ProviderAccountInteractiveRunner } from './provider-account-pty-runner'
import {
  classifyProviderLoginFailure,
  readProviderLoginProgress,
  validateProviderLoginCode,
} from './provider-account-login.pure'

type LoginTarget = Pick<
  ProviderAccountLoginAttempt,
  'providerId' | 'accountId' | 'kind'
>

/** Mediator: one backend-owned login ceremony coordinates the CLI and every
 * Settings mount. Credential mutation and identity checks remain in enrolment. */
export class ProviderAccountLoginService {
  private attempt: ProviderAccountLoginAttempt | null = null
  private controller: AbortController | null = null
  private writeCode: ((value: string) => void) | null = null
  private output = ''
  private timeout: ReturnType<typeof setTimeout> | null = null
  private cancelledBy: 'cancelled' | 'timed-out' | null = null
  private finished: Promise<void> = Promise.resolve()
  private listeners = new Set<(attempt: ProviderAccountLoginAttempt) => void>()

  constructor(
    private readonly deps: {
      runner: ProviderAccountInteractiveRunner
      timeoutMs?: number
      newId?: () => string
      now?: () => Date
    },
  ) {}

  getAttempt(): ProviderAccountLoginAttempt | null {
    return this.attempt ? { ...this.attempt } : null
  }
  subscribe(
    listener: (attempt: ProviderAccountLoginAttempt) => void,
  ): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async run<T>(target: LoginTarget, work: () => Promise<T>): Promise<T> {
    if (this.attempt?.active)
      throw new Error(
        'A provider sign-in is already in progress. Finish or cancel it first.',
      )
    let markFinished!: () => void
    this.finished = new Promise((resolve) => {
      markFinished = resolve
    })
    this.controller = new AbortController()
    this.cancelledBy = null
    this.attempt = {
      ...target,
      id: (this.deps.newId ?? randomUUID)(),
      state: 'preparing',
      active: true,
      authorizationUrl: null,
      message: 'Preparing sign-in…',
      startedAt: (this.deps.now?.() ?? new Date()).toISOString(),
    }
    this.publish({})
    const attemptId = this.attempt.id
    this.timeout = setTimeout(
      () => this.requestCancel(attemptId, 'timed-out'),
      this.deps.timeoutMs ?? 5 * 60_000,
    )
    this.timeout.unref?.()
    try {
      const result = await work()
      this.publish({
        state: 'completed',
        active: false,
        authorizationUrl: null,
        message:
          target.kind === 'enrol'
            ? 'Account connected.'
            : 'Account reconnected.',
      })
      return result
    } catch (error) {
      const failure = classifyProviderLoginFailure(error)
      // A failed credential discard matters even after the user pressed Cancel.
      const cleanupFailed = failure.kind === 'cleanup'
      const state = cleanupFailed
        ? 'failed'
        : (this.cancellationReason() ?? 'failed')
      const message =
        state === 'cancelled'
          ? 'Sign-in cancelled.'
          : state === 'timed-out'
            ? 'Sign-in timed out. Retry when you are ready.'
            : failure.message
      this.publish({ state, active: false, authorizationUrl: null, message })
      // The original error can contain a token or pasted code. Preserve only
      // the classified cause across the IPC boundary.
      /* eslint-disable preserve-caught-error -- Raw OAuth errors can contain credentials; only classified context may cross IPC. */
      throw new Error(message, {
        cause: { providerId: target.providerId, state, kind: failure.kind },
      })
      /* eslint-enable preserve-caught-error */
    } finally {
      if (this.timeout) clearTimeout(this.timeout)
      this.timeout = null
      this.controller = null
      this.writeCode = null
      this.output = ''
      markFinished()
    }
  }

  readonly runLoginCommand: ProviderAccountCommandRunner = async (command) => {
    const attempt = this.attempt
    const controller = this.controller
    if (!attempt?.active || !controller)
      throw new Error('No provider sign-in is active.')
    if (controller.signal.aborted) throw new Error('Sign-in cancelled.')
    this.output = ''
    this.publish({
      state: 'waiting-browser',
      message: 'Complete sign-in in your browser.',
    })
    try {
      const result = await this.deps.runner(command, {
        onExitConfirmed: () => {},
        signal: controller.signal,
        awaitExitOnTimeout: true,
        redactOutput: true,
        onInputReady: (write) => {
          this.writeCode = write
        },
        onData: (chunk) => {
          if (controller.signal.aborted) return
          this.output = (this.output + chunk).slice(-64 * 1024)
          const progress = readProviderLoginProgress(
            this.output,
            attempt.providerId,
          )
          this.publish({
            authorizationUrl:
              progress.authorizationUrl ??
              this.attempt?.authorizationUrl ??
              null,
            state: progress.needsCode ? 'waiting-code' : 'waiting-browser',
            message: progress.needsCode
              ? 'If the browser gives you an authorization code, paste it here.'
              : 'Complete sign-in in your browser.',
          })
        },
      })
      if (controller.signal.aborted) throw new Error('Sign-in cancelled.')
      return { code: result.code, stdout: '', stderr: '' }
    } finally {
      this.writeCode = null
      this.output = ''
      // The runner settles only after actual process exit. Cleanup and identity
      // checks can now proceed without racing a still-writing login child.
      if (this.timeout) clearTimeout(this.timeout)
      this.timeout = null
      if (!controller.signal.aborted)
        this.publish({
          state: 'finishing',
          authorizationUrl: null,
          message: 'Checking the account and finishing sign-in…',
        })
    }
  }

  async shutdown(): Promise<void> {
    if (this.attempt?.active) this.requestCancel(this.attempt.id, 'cancelled')
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.finished,
        new Promise<void>((resolve) => {
          deadline = setTimeout(resolve, 30_000)
          deadline.unref?.()
        }),
      ])
    } finally {
      if (deadline) clearTimeout(deadline)
    }
  }

  cancel(id: string): ProviderAccountLoginAttempt | null {
    this.requestCancel(id, 'cancelled')
    return this.getAttempt()
  }

  submitCode(id: string, value: unknown): void {
    if (
      this.attempt?.id !== id ||
      this.attempt.state !== 'waiting-code' ||
      !this.attempt.active ||
      !this.writeCode
    )
      throw new Error('This login is not waiting for a code.')
    const code = validateProviderLoginCode(value)
    this.output = ''
    this.publish({
      state: 'waiting-browser',
      message: 'Code submitted. Waiting for the provider…',
    })
    this.writeCode(code + '\r')
  }

  private cancellationReason(): 'cancelled' | 'timed-out' | null {
    return this.cancelledBy
  }

  private requestCancel(id: string, reason: 'cancelled' | 'timed-out'): void {
    if (
      this.attempt?.id !== id ||
      !this.attempt.active ||
      this.attempt.state === 'finishing' ||
      this.cancelledBy
    )
      return
    this.cancelledBy = reason
    this.publish({
      state: 'cancelling',
      authorizationUrl: null,
      message: 'Stopping sign-in and finishing account cleanup…',
    })
    this.controller?.abort()
  }

  private publish(patch: Partial<ProviderAccountLoginAttempt>): void {
    if (!this.attempt) return
    const next = { ...this.attempt, ...patch }
    if (
      Object.entries(next).every(
        ([key, value]) =>
          this.attempt?.[key as keyof ProviderAccountLoginAttempt] === value,
      ) &&
      Object.keys(patch).length
    )
      return
    this.attempt = next
    for (const listener of this.listeners) {
      try {
        listener({ ...next })
      } catch {
        /* A closed renderer cannot change a credential outcome. */
      }
    }
  }
}
