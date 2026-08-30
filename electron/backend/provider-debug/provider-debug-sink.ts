import { serializeEntry } from './provider-debug.pure'
import type { ProviderDebugEntry } from './provider-debug.types'

/**
 * Where provider traffic goes to be seen: the debug panel's ring, the JSONL
 * audit trail, stderr.
 *
 * **`record` never throws.** That is the sink's contract and not each caller's
 * problem, because of where the callers are. Recording happens on
 * fire-and-forget paths — most sharply in the remote host's `run()`, one
 * statement after the daemon has answered 201 and before the event stream is
 * opened. A sink that threw there became an unhandled rejection that skipped
 * the stream entirely: one start posted, a live run the daemon was holding,
 * and nothing listening to it, because a renderer had gone away or a disk was
 * full. Telemetry is a description of the work; a description must not be able
 * to retract the thing it describes (MAR-2694 round 2).
 *
 * So every implementation guards its own consequences and reports a failure to
 * `console.error` — the last resort, since a sink cannot report into itself.
 */
export interface ProviderDebugSink {
  /** Records one entry. Never throws, whatever the side channel does. */
  record(entry: ProviderDebugEntry): void
}

export const noopDebugSink: ProviderDebugSink = {
  record() {
    // intentionally empty
  },
}

export function createConsoleDebugSink(
  writeLine: (line: string) => void = (line) =>
    process.stderr.write(`[provider-debug] ${line}\n`),
): ProviderDebugSink {
  return {
    record(entry) {
      // The default writer is `process.stderr.write`, which throws on a closed
      // or broken pipe. The contract above is the interface's, so it holds here
      // too rather than only in the service the app happens to build.
      recordSafely('console sink', () => writeLine(serializeEntry(entry)))
    },
  }
}

/**
 * Runs one consequence of a `record` call and refuses to let it escape.
 *
 * Each consequence gets its own call rather than one guard around all of them:
 * the JSONL file is the audit trail that answers "was a second start
 * attempted?" (MAR-2582), and a broadcast failure that silently skipped the
 * write would make that log lie by omission at the exact moment it matters.
 *
 * The report is guarded too. `console.error` is the last resort and the last
 * resort can be gone — Electron's main process has had a console that throws
 * while the app is quitting — and a reporter that throws would put the caller
 * back where it started.
 */
export function recordSafely<T>(what: string, run: () => T): T | null {
  try {
    return run()
  } catch (error) {
    try {
      console.error(`[provider-debug] ${what} failed`, error)
    } catch {
      // Nothing left to report into. The contract still holds.
    }
    return null
  }
}
