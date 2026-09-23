/**
 * Pure classifier for Cursor ACP `stopReason` values.
 *
 * Strategy: a single function maps every ACP `stopReason` (including missing
 * and non-string values) to one of five stable classes so the settle block
 * never embeds string switches itself (R1). It also returns the word the
 * transcript prints for that value, so the settle block never reads the raw
 * result a second time (MAR-3247 R3).
 */
export type CursorAcpStopReasonClass =
  | 'done'
  | 'cancelled'
  | 'cut-short'
  | 'refused'
  | 'unknown'

export interface CursorAcpStopReason {
  kind: CursorAcpStopReasonClass
  /**
   * The wire's own value as the transcript prints it: the string itself,
   * `none` when the value is missing or null, else `String(value)`.
   */
  word: string
}

/**
 * Classify the `stopReason` from a Cursor `session/prompt` result.
 *
 * - `end_turn` → `done`
 * - `cancelled` → `cancelled`
 * - `max_tokens` / `max_turn_requests` → `cut-short`
 * - `refusal` → `refused`
 * - missing, non-string, or any other value → `unknown`
 */
export function classifyCursorAcpStopReason(
  result: unknown,
): CursorAcpStopReason {
  const reason =
    result && typeof result === 'object' && 'stopReason' in result
      ? (result as Record<string, unknown>).stopReason
      : undefined

  const word = reason === undefined || reason === null ? 'none' : String(reason)
  return { kind: classifyReason(reason), word }
}

function classifyReason(reason: unknown): CursorAcpStopReasonClass {
  if (typeof reason !== 'string') return 'unknown'

  switch (reason) {
    case 'end_turn':
      return 'done'
    case 'cancelled':
      return 'cancelled'
    case 'max_tokens':
    case 'max_turn_requests':
      return 'cut-short'
    case 'refusal':
      return 'refused'
    default:
      return 'unknown'
  }
}

/**
 * The warning note an unusual ending writes into the transcript (MAR-3242
 * R2), or null for `done` and `cancelled`, which write none of their own.
 */
export function formatCursorAcpStopReasonNote(
  stopReason: CursorAcpStopReason,
): string | null {
  switch (stopReason.kind) {
    case 'cut-short':
      return `Cursor ended this turn early: ${stopReason.word}.`
    case 'refused':
      return "Cursor's model refused this turn."
    case 'unknown':
      return `Cursor ended this turn with an ending Convergence does not know: ${stopReason.word}.`
    case 'done':
    case 'cancelled':
      return null
  }
}
