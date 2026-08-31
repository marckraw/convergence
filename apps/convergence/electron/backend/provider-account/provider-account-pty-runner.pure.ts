/**
 * Reading a terminal stream as text (PA11.1).
 *
 * A PTY hands back what a screen would have shown, not what a pipe would have
 * carried: cursor moves, colours, spinner redraws and carriage returns all
 * arrive in band. These helpers turn that into the plain text a human error
 * message can quote, and stay pure so the rules are testable without spawning
 * anything.
 */

const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)

/**
 * ANSI escape sequences, as data.
 *
 * OSC (`ESC ] ... BEL`) is matched before CSI (`ESC [ ... final`) because its
 * payload can contain anything, including sequences that look like the others;
 * the last pattern catches the short two-character escapes left over. Built
 * with `RegExp` rather than literals so the escape character appears once, by
 * name, instead of as an invisible byte in the source.
 */
const ANSI_PATTERNS: readonly RegExp[] = [
  new RegExp(`${ESC}\\][\\s\\S]*?(?:${BEL}|${ESC}\\\\)`, 'g'),
  new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'g'),
  new RegExp(`${ESC}[ -/][0-~]`, 'g'),
  new RegExp(`${ESC}[@-Z\\\\-_]`, 'g'),
]

/**
 * Control characters that carry no meaning once the screen is gone, as
 * ranges. Tab, newline and carriage return are deliberately absent: they are
 * layout a reader still wants.
 */
const BARE_CONTROL_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x7f],
]

const BARE_CONTROL_CHARACTERS = new RegExp(
  `[${BARE_CONTROL_RANGES.map(
    ([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`,
  ).join('')}]`,
  'g',
)

/**
 * Flattens terminal output to readable lines.
 *
 * Carriage returns become newlines rather than being dropped: a CLI that
 * redraws one line with `\r` is showing successive states, and the last one is
 * usually the answer. Keeping them as separate lines means the tail of the
 * output is still the newest thing said.
 */
export function stripTerminalControlSequences(raw: string): string {
  let text = raw
  for (const pattern of ANSI_PATTERNS) {
    text = text.replace(pattern, '')
  }
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(BARE_CONTROL_CHARACTERS, '')
}

/**
 * The last few things a command said, for quoting back to a person.
 *
 * Terminal output is long and mostly redraw; the tail is where the outcome
 * lives. Returns an empty string when there is nothing printable, so callers
 * can fall back to the exit code rather than showing a blank quote.
 */
export function summarizeTerminalOutput(raw: string, maxLines = 3): string {
  const lines = stripTerminalControlSequences(raw)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  return lines.slice(-maxLines).join('\n').trim()
}
