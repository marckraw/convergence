/**
 * What an attempt row may say about a request (MAR-3422 CV3d R3): a refused
 * line, capped, and a failure's class -- never the error's own message, which
 * can carry a path or an account detail.
 */

/** A refused line is kept up to this many characters. */
export const REFUSED_TEXT_MAX_CHARS = 500

export type BlockSentenceFailureClass = 'timeout' | 'turn-failed' | 'error'

export function refusedText(text: string): string {
  return text.trim().slice(0, REFUSED_TEXT_MAX_CHARS)
}

/** A fixed word for why the call failed; the message itself is dropped. */
export function failureClass(error: unknown): BlockSentenceFailureClass {
  const message = error instanceof Error ? error.message : ''
  if (/\btimed out\b/i.test(message)) return 'timeout'
  if (/^codex oneShot turn\b/.test(message)) return 'turn-failed'
  return 'error'
}
