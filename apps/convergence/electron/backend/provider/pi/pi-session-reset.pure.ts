import type { PiResponse } from './pi-rpc'

/**
 * What Pi said to `{"type":"new_session"}` (MAR-3215).
 *
 * Three answers, not two: an extension's `session_before_switch` handler may
 * veto the switch, and Pi reports that as a SUCCESSFUL response carrying
 * `data.cancelled: true` — measured on Pi 0.85.1, where an unvetoed switch
 * answers `{"command":"new_session","success":true,"data":{"cancelled":false}}`.
 * Reading `success` alone would call a veto a fresh session and draw a
 * boundary over a conversation that is still the model's.
 */
export type PiNewSessionVerdict =
  | { kind: 'switched' }
  | { kind: 'cancelled' }
  | { kind: 'refused'; error: string }

export function readPiNewSessionVerdict(
  response: Pick<PiResponse, 'success' | 'data' | 'error'>,
): PiNewSessionVerdict {
  if (!response.success) {
    return { kind: 'refused', error: response.error || 'unknown error' }
  }
  const data = response.data
  if (
    data &&
    typeof data === 'object' &&
    (data as { cancelled?: unknown }).cancelled === true
  ) {
    return { kind: 'cancelled' }
  }
  return { kind: 'switched' }
}

/**
 * The session file a `get_state` response names, or null.
 *
 * Pi reports no `sessionFile` when it runs with `--no-session`, and a file it
 * names need not exist on disk yet: Pi writes it with the first message, and
 * `--session <that path>` opens an empty session there (measured, 0.85.1).
 */
export function readPiSessionFile(
  response: Pick<PiResponse, 'success' | 'data'>,
): string | null {
  if (!response.success || !response.data) return null
  if (typeof response.data !== 'object') return null
  const sessionFile = (response.data as { sessionFile?: unknown }).sessionFile
  return typeof sessionFile === 'string' && sessionFile ? sessionFile : null
}

/**
 * How long one new-session probe may wait for Pi to name a file (MAR-3298).
 * A silent probe is retried once; the failure note names both attempts.
 */
export const PI_NEW_SESSION_TIMEOUT_MS = 20_000

/** The reason after two silent probes (MAR-3298 R1). */
export function buildPiNewSessionTimeoutReason(): string {
  return `Pi did not name its new session in time (2 × ${PI_NEW_SESSION_TIMEOUT_MS / 1000} s).`
}

/**
 * The sentence a reset that did not happen leaves in the transcript.
 *
 * Every failure keeps the previous conversation current, so every failure
 * says so: the reader's next question is whether their next message still
 * carries the old context, and the answer is yes.
 */
export function buildPiResetFailureNote(reason: string): string {
  return `Could not clear the conversation: ${reason} The previous conversation is still active; your next message will resume it.`
}

export const PI_RESET_VETOED_REASON =
  'a Pi extension cancelled the new session.'
