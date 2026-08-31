/**
 * Turning a text selection into an anchor (RA2).
 *
 * Deliberately no DOM offsets. Rendered markdown re-renders — a code block
 * highlights late, a mermaid diagram resolves, a link rewrites — and any
 * offset into that tree is stale the moment it is taken. A quote plus a little
 * surrounding text survives all of it, and the quote alone is what the model
 * is shown (ruling 1), so the worst case of a failed re-locate is a missing
 * highlight rather than a missing message.
 */

/** How much text on each side is kept to tell two identical quotes apart. */
export const ANNOTATION_CONTEXT_LENGTH = 40

export interface AnnotationAnchor {
  quotedText: string
  prefix: string
  suffix: string
}

/**
 * Builds the anchor for a selection inside one message.
 *
 * Returns null when there is nothing to quote, which is the only real failure
 * here: a selection of pure whitespace is a click, not an intention.
 *
 * When the same words appear more than once in a message the first occurrence
 * wins. That can attach the context of the wrong twin — a cosmetic error in a
 * cosmetic field — and is the deliberate price of not tracking offsets.
 */
export function buildAnnotationAnchor(input: {
  messageText: string
  selectedText: string
}): AnnotationAnchor | null {
  const quotedText = input.selectedText.trim()
  if (!quotedText) return null

  const index = input.messageText.indexOf(quotedText)
  if (index < 0) {
    // The selection crossed rendering boundaries badly enough that the plain
    // text no longer contains it verbatim. Ship the quote anyway — it is the
    // payload; only the highlight needs the context.
    return { quotedText, prefix: '', suffix: '' }
  }

  return {
    quotedText,
    prefix: input.messageText.slice(
      Math.max(0, index - ANNOTATION_CONTEXT_LENGTH),
      index,
    ),
    suffix: input.messageText.slice(
      index + quotedText.length,
      index + quotedText.length + ANNOTATION_CONTEXT_LENGTH,
    ),
  }
}

/** Roughly what a chip can show without becoming a paragraph. */
const CHIP_EXCERPT_LENGTH = 80

/**
 * The quote as a chip shows it: one line, ellipsised. The full quote is still
 * what gets sent — this is only how it looks while it waits.
 */
export function toChipExcerpt(quotedText: string): string {
  const singleLine = quotedText.replace(/\s+/g, ' ').trim()
  return singleLine.length > CHIP_EXCERPT_LENGTH
    ? `${singleLine.slice(0, CHIP_EXCERPT_LENGTH).trimEnd()}…`
    : singleLine
}
