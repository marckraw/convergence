/**
 * Whether a docblock documents anything (MAR-3151).
 *
 * Ten times in these trees a `/**` block sat directly against ANOTHER `/**`
 * block -- displaced when a method was inserted above the function it
 * described -- and every one was found by a reader rather than by a gate. A
 * docblock that documents nothing is worse than none: it states a behaviour
 * about whatever happens to be under it.
 *
 * The rule is the insertion's own signature, and it is a blank line:
 *
 * - a block whose VERY NEXT line opens another block documents that block,
 *   which is the orphan shape -- an editor pasting a new method with its own
 *   docblock leaves the old one flush against it;
 * - a block separated from the next by a blank line is PROSE the author stood
 *   apart on purpose: a module note or a section note. Measured, not assumed:
 *   every one of the sixteen notes in `electron/backend` and `src` is
 *   separated that way, and nine of the ten displaced blocks were flush.
 *
 * So the exemption is narrow in the way that matters -- it is not "the first
 * block in a file", which would wave a block displaced to the top of a file
 * straight through (`crew/crew.types.ts` was exactly that).
 *
 * `docblock-shape.walk.test.ts` spends this on both trees.
 */

const BLOCK_OPEN = /^\/\*\*/

/** A `/**` block, by the 1-indexed lines it spans, inclusive. */
interface DocblockSpan {
  start: number
  end: number
}

function closesOn(line: string, isOpener: boolean): boolean {
  const trimmed = line.trim()
  // A one-line `/** ... */` opens and closes on the same line; anything else
  // runs to the first line that closes it.
  return isOpener
    ? trimmed.length > 3 && trimmed.endsWith('*/')
    : trimmed.includes('*/')
}

function spansOf(lines: readonly string[]): DocblockSpan[] {
  const spans: DocblockSpan[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!BLOCK_OPEN.test(lines[index]!.trim())) continue
    let end = index
    while (end < lines.length && !closesOn(lines[end]!, end === index)) {
      end += 1
    }
    // An unterminated block: nothing after it can be read, so stop rather
    // than report the rest of the file as one enormous comment.
    if (end >= lines.length) break
    spans.push({ start: index + 1, end: end + 1 })
    index = end
  }
  return spans
}

/**
 * The start lines of every docblock that documents another docblock.
 *
 * Empty means every block in the source sits above something it can be about,
 * or stands apart as prose.
 */
export function findAdjacentDocblocks(source: string): number[] {
  const lines = source.split('\n')
  return spansOf(lines)
    .filter((span) => {
      const next = lines[span.end]
      return next !== undefined && BLOCK_OPEN.test(next.trim())
    })
    .map((span) => span.start)
}
