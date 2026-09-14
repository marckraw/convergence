import { createRingBuffer } from '../terminal/ring-buffer.pure'
import type { PtyFactory } from '../terminal/terminal.types'
import type { ProviderAccountCommand } from './provider-account-enrolment.pure'
import { summarizeTerminalOutput } from './provider-account-pty-runner.pure'

/**
 * Running a provider command on a terminal instead of a pipe (PA11.1).
 *
 * `claude mcp login` refuses piped stdio outright — "stdin isn't a terminal,
 * so authentication can't be completed here" — which is how the Authorize
 * button failed QA on the installed build. The fix is not a flag but a
 * different kind of child process: a PTY, so the CLI sees the terminal it
 * insists on.
 *
 * ## Adapter (design pattern)
 *
 * Adapts the terminal feature's `PtyFactory` to the same
 * command-in/result-out shape the piped provider-account runner already has,
 * so callers choose their stdio by picking a runner rather than by branching.
 * The factory stays injected: node-pty is a native module, and keeping the
 * import at the composition root is what lets every test here run hermetically.
 */

export interface InteractiveCommandResult {
  code: number
  /** A terminal has one stream, so stdout and stderr arrive interleaved. */
  output: string
}

export type ProviderAccountInteractiveRunner = (
  command: ProviderAccountCommand,
  lifecycle?: {
    onExitConfirmed: () => void
    signal?: AbortSignal
    onData?: (chunk: string) => void
    onInputReady?: (write: (value: string) => void) => void
    /** Login cleanup must not run while its child can still write credentials. */
    awaitExitOnTimeout?: boolean
    /** Login output can contain OAuth state and pasted codes. Never return it. */
    redactOutput?: boolean
  },
) => Promise<InteractiveCommandResult>

/**
 * How long a person gets to finish an OAuth ceremony.
 *
 * This is a human clock, not a machine one: the browser opens, someone picks
 * an account, approves scopes, maybe finds a password manager. Generous, but
 * bounded — a PTY that never exits would otherwise hold the handler forever.
 */
export const DEFAULT_INTERACTIVE_COMMAND_TIMEOUT_MS = 5 * 60_000

/** A plausible terminal. CLIs wrap their output to it, so it must not be tiny. */
const DEFAULT_COLS = 120
const DEFAULT_ROWS = 30

/**
 * Enough output to explain a failure, bounded so a chatty or looping command
 * cannot grow the main process's memory.
 */
const MAX_OUTPUT_BYTES = 64 * 1024

export interface PtyCommandRunnerDeps {
  ptyFactory: PtyFactory
  timeoutMs?: number
}

export function createPtyCommandRunner(
  deps: PtyCommandRunnerDeps,
): ProviderAccountInteractiveRunner {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_INTERACTIVE_COMMAND_TIMEOUT_MS

  return (command, lifecycle) =>
    new Promise<InteractiveCommandResult>((resolve, reject) => {
      const buffer = createRingBuffer(MAX_OUTPUT_BYTES)

      if (lifecycle?.signal?.aborted) {
        lifecycle.onExitConfirmed()
        reject(new Error('Sign-in cancelled.'))
        return
      }
      let child: ReturnType<PtyFactory['spawn']>
      try {
        child = deps.ptyFactory.spawn({
          shell: command.command,
          args: command.args,
          cwd: command.cwd ?? process.cwd(),
          env: command.env,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
        })
      } catch (error) {
        lifecycle?.onExitConfirmed()
        reject(
          lifecycle?.redactOutput
            ? new Error('The sign-in terminal could not be started.')
            : error instanceof Error
              ? error
              : new Error(String(error)),
        )
        return
      }

      let settled = false
      let escalation: ReturnType<typeof setTimeout> | null = null
      let stopped: Error | null = null
      let dataClosed = false
      const dataSubscription = child.onData((chunk) => {
        if (!lifecycle?.redactOutput) buffer.append(chunk)
        lifecycle?.onData?.(chunk)
      })
      const exitSubscription = child.onExit(({ exitCode }) => {
        if (escalation) clearTimeout(escalation)
        lifecycle?.onExitConfirmed()
        exitSubscription.dispose()
        if (settled) return
        settled = true
        finish()
        if (stopped) reject(stopped)
        else
          resolve({
            code: exitCode,
            output: lifecycle?.redactOutput ? '' : buffer.snapshot(),
          })
      })

      const abort = () => stop(new Error('Sign-in cancelled.'))
      const timer = setTimeout(() => {
        const tail = lifecycle?.redactOutput
          ? ''
          : summarizeTerminalOutput(buffer.snapshot())
        stop(
          new Error(
            `timed out after ${Math.round(timeoutMs / 1000)}s${tail ? `; last output was: ${tail}` : ''}`,
          ),
        )
      }, timeoutMs)
      timer.unref?.()
      lifecycle?.signal?.addEventListener('abort', abort, { once: true })
      lifecycle?.onInputReady?.((value) => {
        if (!settled && !stopped) child.write(value)
      })
      if (lifecycle?.signal?.aborted) abort()

      function stop(reason: Error): void {
        if (settled || stopped) return
        stopped = reason
        finish()
        escalation = setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {
            /* Only onExit releases the lease. */
          }
        }, 5000)
        escalation.unref?.()
        if (!lifecycle?.awaitExitOnTimeout) {
          settled = true
          reject(reason)
        }
        try {
          child.kill()
        } catch {
          /* Await the exit witness, never guess. */
        }
      }

      function finish(): void {
        clearTimeout(timer)
        lifecycle?.signal?.removeEventListener('abort', abort)
        if (!dataClosed) {
          dataClosed = true
          dataSubscription.dispose()
        }
      }
    })
}
