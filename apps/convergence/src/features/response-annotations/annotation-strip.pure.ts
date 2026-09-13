/**
 * The words and the keys of the RESPONDING TO strip (MAR-3004).
 *
 * Fourteen full-width chips stacked a screen tall and pushed the transcript
 * out of view, so pending annotations wait as one horizontal row of compact
 * pills. These helpers decide what a pill says and how focus moves along the
 * row. They decide nothing about what is SENT: the compiler reads the store,
 * and the strip only ever changes how an annotation waits.
 */

/** Enough of the quote to recognise the place, never enough to wrap. */
export const ANNOTATION_PILL_QUOTE_WORDS = 5

/** Enough of the response to recognise it; a reaction is shown whole. */
export const ANNOTATION_PILL_BODY_WORDS = 4

function firstWords(text: string, count: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length <= count) return words.join(' ')
  return `${words.slice(0, count).join(' ')}…`
}

/** The quote as a pill shows it: one line, its first few words. */
export function toPillQuote(quotedText: string): string {
  return firstWords(quotedText, ANNOTATION_PILL_QUOTE_WORDS)
}

/** The response as a pill shows it. A 👍 is one word, so it survives whole. */
export function toPillBody(body: string): string {
  return firstWords(body, ANNOTATION_PILL_BODY_WORDS)
}

/** The badge's words, honest about one. */
export function formatAnnotationCount(count: number): string {
  return `${count} ${count === 1 ? 'annotation' : 'annotations'}`
}

/**
 * Where focus goes along the strip for a key, or null when the key is not
 * navigation — so Enter and typing are left to the pill itself.
 *
 * Stops at the ends rather than wrapping: on a horizontally scrolled row a
 * wrap jumps the viewport from one edge to the other, which reads as the
 * strip resetting rather than as moving one step.
 */
export function moveAlongStrip(
  index: number,
  key: string,
  length: number,
): number | null {
  if (length <= 0) return null
  const last = length - 1
  switch (key) {
    case 'ArrowRight':
      return Math.min(index + 1, last)
    case 'ArrowLeft':
      return Math.max(index - 1, 0)
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return null
  }
}
