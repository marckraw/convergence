/**
 * Pure classifier for Cursor ACP `stopReason` values.
 *
 * Strategy: a single function maps every ACP `stopReason` (including missing
 * and non-string values) to one of five stable classes so the settle block
 * never embeds string switches itself (R1).
 */
export type CursorAcpStopReasonClass =
  | 'done'
  | 'cancelled'
  | 'cut-short'
  | 'refused'
  | 'unknown'

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
): CursorAcpStopReasonClass {
  const reason =
    result && typeof result === 'object' && 'stopReason' in result
      ? (result as Record<string, unknown>).stopReason
      : undefined

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
