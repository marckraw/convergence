/**
 * What a Cursor turn that died looks like on the wire (MAR-3302).
 *
 * The CLI writes its own death into the message stream as an ordinary
 * `agent_message_chunk`, ends the prompt with `stopReason: end_turn`, and
 * keeps the process alive. Nothing else on the wire says the turn died, so
 * the text is the only fact there is. Three samples from the record:
 *
 * - 2026-09-18 09:51:54Z (MAR-3159): `Error: T: WritableIterable is closed`
 * - 2026-09-22 08:01:47Z (MAR-3298 lap 1):
 *   `Error: RetriableError: [canceled] http/2 stream closed with error code CANCEL (0x8)`
 * - 2026-09-22 08:59:59Z (MAR-3298 lap 2): the same `RetriableError … CANCEL` line.
 *
 * Probe 2 (MAR-3239) could not provoke the death in three attempts: every
 * probed turn ended `end_turn` with the process alive. There is no
 * discriminator besides the text.
 *
 * The rule is kept narrow on purpose: the whole last assistant segment must
 * be exactly one line that starts with this prefix. A match anywhere inside
 * the text does not count, and neither does text that merely contains
 * "Error". A real reply that opens with `Error:` and goes on to a second line
 * is a reply.
 */
export const CURSOR_DEAD_TURN_PREFIX = 'Error: '

/** True iff `assistantText`, trimmed, is one non-empty line starting `Error: `. */
export function isDeadTurnText(assistantText: string): boolean {
  const line = assistantText.trim()
  if (!line) return false
  if (line.includes('\n')) return false
  return line.startsWith(CURSOR_DEAD_TURN_PREFIX)
}

/** The warning note a dead turn's line becomes (MAR-3302 R2). */
export function formatCursorDeadTurnNote(assistantText: string): string {
  return `Cursor's turn died: ${assistantText.trim()}`
}
