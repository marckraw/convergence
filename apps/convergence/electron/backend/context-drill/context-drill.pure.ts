/**
 * The drill's two sentences and the one line it reads back (MAR-3255 R1).
 *
 * Pure on purpose: the routine spends a provider turn and then rewrites a
 * conversation's memory, and the decision to do the second is made HERE, from
 * a string, where it can be tested without either.
 */

/**
 * Beat 1, said to a mastermind conversation verbatim.
 *
 * Static, and static by ruling: what the agent has to do when it hears this
 * lives in its own revival protocol, not in a message Convergence composes.
 * A drill that carried state would be a second copy of the protocol, kept in
 * an app that cannot read whether it is still true.
 */
export const DRILL_BEFORE_MESSAGE = 'You know the drill.'

/** Beat 3, said after the context has actually been compacted. */
export const DRILL_AFTER_MESSAGE =
  'You were just compacted. Read the newest REVIVAL PROTOCOL in your memory first, end to end, then the tail of your ledger. Prove continuity, then resume at RESUME.'

/**
 * What a sealing reply declared about its own seal.
 *
 * Three cases rather than a boolean, because the third is a different fact
 * from the second and the routine owes the user different words for it: an
 * agent that says `NOT SEALED: the push failed` knows why, and an agent that
 * said nothing at all may simply have answered something else entirely.
 */
export type SealDeclaration =
  | { kind: 'sealed'; detail: string }
  | { kind: 'not-sealed'; reason: string }
  | { kind: 'absent' }

const SEALED_PREFIX = 'SEALED:'
const NOT_SEALED_PREFIX = 'NOT SEALED:'

/**
 * How many lines at the end of the reply are the declaration's window.
 *
 * Three: the seal line sits directly above the `BATON:` line by convention,
 * and the third is the spare a formatter's rule or sign-off takes. Narrow on
 * purpose -- see `readSealDeclaration`.
 */
const SEAL_WINDOW_LINES = 3

/**
 * The marks a formatter puts in FRONT of a line: emphasis, code, quote.
 *
 * Stripped from the left only, and the reason is the same one that cost
 * MAR-2815 a day: a mastermind whose every reply is markdown bolds its
 * closing lines by reflex, and `**SEALED: #30 abc1234**` must not read as
 * silence. What it leaves behind -- the trailing marks, inside `detail` --
 * is display text nothing branches on, so peeling them would be tidying at
 * the cost of a second rule to keep in step with this one.
 */
const LEADING_MARKS = new Set(['*', '_', '`', '>', ' ', '\t'])

function stripLeadingMarks(line: string): string {
  let start = 0
  while (start < line.length && LEADING_MARKS.has(line[start])) start += 1
  return line.slice(start).trim()
}

/** The last few non-empty lines, normalised, oldest first. */
function sealWindow(message: string): string[] {
  const lines: string[] = []
  for (const raw of message.split('\n')) {
    const line = raw.trim()
    if (line.length > 0) lines.push(stripLeadingMarks(line))
  }
  return lines.slice(-SEAL_WINDOW_LINES)
}

/**
 * Whether the agent said it sealed, read from the END of its reply
 * (MAR-3255 R1).
 *
 * Two properties carry the whole rule, and both are load-bearing.
 *
 * ANCHORED: `startsWith`, not `includes`. A reply that discusses sealing --
 * "I would say SEALED: once the push lands" -- has declared nothing, and a
 * reader that matched anywhere in the line would read `NOT SEALED: push
 * refused` as a seal, which is the exact inversion this fence exists to
 * prevent.
 *
 * WINDOWED: only the last three non-empty lines. An agent quoting its own
 * earlier seal mid-report is describing history; the declaration is the
 * thing it writes at the bottom, once, beside the baton.
 *
 * The refusal is read across the WHOLE window before any seal is accepted:
 * a reply carrying both lines has refused, whatever order they are in.
 * Absence is a refusal too, but that ruling belongs to the caller -- here it
 * is simply the third answer.
 */
export function readSealDeclaration(message: string | null): SealDeclaration {
  if (message === null) return { kind: 'absent' }
  const window = sealWindow(message)

  const refusal = window.find((line) => line.startsWith(NOT_SEALED_PREFIX))
  if (refusal)
    return {
      kind: 'not-sealed',
      reason: refusal.slice(NOT_SEALED_PREFIX.length).trim(),
    }

  const seal = window.find((line) => line.startsWith(SEALED_PREFIX))
  if (seal)
    return { kind: 'sealed', detail: seal.slice(SEALED_PREFIX.length).trim() }

  return { kind: 'absent' }
}
