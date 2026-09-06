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

/**
 * The two ways the server says "that thread is not something I can resume".
 *
 * `no rollout found for thread id …` is the second one, and the substring
 * heuristic below misses it entirely: a thread only gets a rollout after its
 * first user message, so a session whose thread never took a turn was told its
 * turn had simply failed (measured on 0.153.4; constitution A4).
 */
export function isCodexThreadNotFoundError(err: unknown): boolean {
  const message = readErrorMessage(err).toLowerCase()
  if (message.includes('no rollout found')) return true
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

/**
 * Codex says outright whether it is going to retry.
 *
 * `willRetry` is on the error notification itself, so the wording lists below
 * are a *fallback* for payloads that omit it — never the first answer. Reading
 * the field first is what stops a new retry wording (or a new terminal one)
 * from being classified by whichever list happens to contain a matching word
 * (constitution A4).
 */
export function readCodexErrorWillRetry(params: unknown): boolean | null {
  const payload =
    typeof params === 'object' && params !== null
      ? (params as { willRetry?: unknown; error?: unknown })
      : null

  if (typeof payload?.willRetry === 'boolean') return payload.willRetry

  const nested =
    typeof payload?.error === 'object' && payload.error !== null
      ? (payload.error as { willRetry?: unknown })
      : null

  return typeof nested?.willRetry === 'boolean' ? nested.willRetry : null
}

export function classifyCodexErrorNotification(
  message: string,
  willRetry: boolean | null = null,
): CodexErrorDisposition {
  // The server's own answer wins: it knows whether it is retrying.
  if (willRetry === true) return 'transient'
  if (willRetry === false) return 'fatal'

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

export function buildCodexThreadRecoveryEntry(
  timestamp: string,
): CodexNoteDraft {
  return {
    text: 'Codex thread was no longer available. Started a new thread; previous provider context may be missing.',
    level: 'warning',
    timestamp,
  }
}
