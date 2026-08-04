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

  return (command) =>
    new Promise<InteractiveCommandResult>((resolve, reject) => {
      const buffer = createRingBuffer(MAX_OUTPUT_BYTES)

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
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }

      let settled = false
      const dataSubscription = child.onData((chunk) => buffer.append(chunk))
      const exitSubscription = child.onExit(({ exitCode }) => {
        if (settled) return
        settled = true
        finish()
        resolve({ code: exitCode, output: buffer.snapshot() })
      })

      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        finish()
        // Killing first: the answer below is only true once nothing can still
        // be waiting on a terminal no one is reading.
        try {
          child.kill()
        } catch {
          // A process that already died cannot be killed twice, and that is
          // the good case rather than something to report.
        }
        const tail = summarizeTerminalOutput(buffer.snapshot())
        reject(
          new Error(
            `timed out after ${Math.round(timeoutMs / 1000)}s${
              tail ? `; last output was: ${tail}` : ''
            }`,
          ),
        )
      }, timeoutMs)
      timer.unref?.()

      function finish(): void {
        clearTimeout(timer)
        dataSubscription.dispose()
        exitSubscription.dispose()
      }
    })
}
