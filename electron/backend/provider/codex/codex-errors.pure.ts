export interface CodexNoteDraft {
  text: string
  level: 'info' | 'warning' | 'error'
  timestamp: string
}

function readErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function buildTurnFailureEntry(
  err: unknown,
  timestamp: string,
): CodexNoteDraft {
  return {
    text: `Turn failed: ${readErrorMessage(err)}`,
    level: 'error',
    timestamp,
  }
}

export function isCodexThreadNotFoundError(err: unknown): boolean {
  const message = readErrorMessage(err).toLowerCase()
  return message.includes('thread') && message.includes('not found')
}

/**
 * How an `error` notification from the Codex app-server should be treated.
 *
 * Codex pushes two very different things down the one `error` channel: its own
 * internal stream-retry notices — "Reconnecting... 2/5" comes from
 * `core/src/responses_retry.rs`, and the CLI is still working — and genuine
 * terminal failures. Convergence used to treat every one of them as fatal,
 * which failed the session, released the handle and SIGTERMed the app-server
 * *while it was retrying* (MAR-2315).
 *
 * `unknown` is deliberately its own answer rather than being folded into
 * either side. An unrecognised wording must not fail the session — the process
 * is the source of truth, and the child exit handler is the backstop — but it
 * must not claim a retry is under way either.
 */
export type CodexErrorDisposition = 'transient' | 'fatal' | 'unknown'

/**
 * Wordings that mean "Codex is still working on it".
 *
 * Taken from the strings of the installed CLI (0.147.0) rather than invented:
 * the retry notice itself, the SSE/stream interruptions it retries on, and the
 * connection failures underneath them.
 */
const TRANSIENT_ERROR_PATTERNS = [
  'reconnecting',
  'stream disconnected',
  'stream error',
  'stream ended',
  'connection failed',
  'connection reset',
  'retrying',
]

/**
 * Wordings that mean Codex has stopped trying.
 *
 * Checked before the transient list, because the message that ends a retry
 * loop ("exceeded retry limit, last status: 429") is otherwise indistinguishable
 * from the notices that filled it.
 */
const FATAL_ERROR_PATTERNS = [
  'exceeded retry limit',
  'usage limit',
  'please sign in again',
  'could not be refreshed',
]

export function classifyCodexErrorNotification(
  message: string,
): CodexErrorDisposition {
  const normalized = message.toLowerCase()

  if (FATAL_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'fatal'
  }

  if (
    TRANSIENT_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern))
  ) {
    return 'transient'
  }

  return 'unknown'
}

export function readCodexErrorNotificationMessage(params: unknown): string {
  const payload =
    typeof params === 'object' && params !== null
      ? (params as { error?: unknown; message?: unknown })
      : null

  const nested =
    typeof payload?.error === 'object' && payload.error !== null
      ? (payload.error as { message?: unknown })
      : null

  if (typeof nested?.message === 'string' && nested.message) {
    return nested.message
  }

  if (typeof payload?.message === 'string' && payload.message) {
    return payload.message
  }

  return 'Unknown error'
}

export function buildCodexErrorNote(
  message: string,
  disposition: CodexErrorDisposition,
  timestamp: string,
): CodexNoteDraft {
  if (disposition === 'transient') {
    return {
      text: `Codex hit a temporary problem and is retrying: ${message}`,
      level: 'warning',
      timestamp,
    }
  }

  if (disposition === 'unknown') {
    return {
      text: `Codex reported an error: ${message}`,
      level: 'warning',
      timestamp,
    }
  }

  return { text: `Error: ${message}`, level: 'error', timestamp }
}

/**
 * What the session should say when the app-server process ends.
 *
 * Two silences used to live here (MAR-2317). A crash produced a bare "Process
 * exited with code 1" while the process's own explanation sat unread in stderr;
 * and an exit code of 0 in the middle of a turn produced nothing at all, so the
 * session stayed "running" with no process behind it, forever.
 *
 * Returns `null` for the one exit that genuinely needs no note: a clean one
 * while nothing was in flight.
 */
export function buildCodexProcessExitEntry(input: {
  code: number | null
  stderrTail: string
  interruptedTurn: boolean
  timestamp: string
}): CodexNoteDraft | null {
  const tail = input.stderrTail.trim()
  const suffix = tail ? `: ${tail}` : ''
  const crashed = input.code !== 0 && input.code !== null

  if (crashed) {
    return {
      text: `Process exited with code ${input.code}${suffix}`,
      level: 'error',
      timestamp: input.timestamp,
    }
  }

  if (input.interruptedTurn) {
    return {
      text: `The Codex process ended before finishing the turn${suffix}`,
      level: 'error',
      timestamp: input.timestamp,
    }
  }

  return null
}

export function buildCodexThreadRecoveryEntry(
  timestamp: string,
): CodexNoteDraft {
  return {
    text: 'Codex thread was no longer available. Started a new thread; previous provider context may be missing.',
    level: 'warning',
    timestamp,
  }
}
