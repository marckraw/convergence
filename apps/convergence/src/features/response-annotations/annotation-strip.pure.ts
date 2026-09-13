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

/** A key press as the strip sees it: the key, its modifiers, where it began. */
export interface StripKeystroke {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  /** The press began in a field that edits text (input, textarea, …). */
  fromTextField: boolean
}

/**
 * Where a key press moves focus along the strip, or null when it is not the
 * strip's to take.
 *
 * Inside the open chip's edit field ← moves the caret and Home/End go to the
 * line's ends; with a modifier held (Shift+← selects, ⌘+← jumps) the key means
 * something else again. The row claiming any of those would throw focus to
 * another pill and strand the draft mid-sentence (MAR-3004 lap 2).
 */
export function stripNavigationTarget(
  index: number,
  keystroke: StripKeystroke,
  length: number,
): number | null {
  if (keystroke.fromTextField) return null
  if (
    keystroke.altKey ||
    keystroke.ctrlKey ||
    keystroke.metaKey ||
    keystroke.shiftKey
  ) {
    return null
  }
  return moveAlongStrip(index, keystroke.key, length)
}

/**
 * The strip's one Tab stop, so fourteen pills are not fourteen stops between
 * the transcript and the composer: the open item if there is one, else the
 * pill last focused, else the first. The last-focused pill keeps the stop so
 * that Shift+Tab back into the row returns to where the arrows left it rather
 * than to its start.
 */
export function resolveTabStop(
  annotationIds: readonly string[],
  expandedId: string | null,
  lastFocusedId: string | null,
): string | null {
  if (expandedId !== null && annotationIds.includes(expandedId)) {
    return expandedId
  }
  if (lastFocusedId !== null && annotationIds.includes(lastFocusedId)) {
    return lastFocusedId
  }
  return annotationIds[0] ?? null
}

/**
 * Where focus lands once an annotation is removed: the pill after it, else the
 * one before, else nowhere (the strip is gone). Read from the list as it was
 * BEFORE the removal, while the removed one still has a position.
 */
export function neighbourAfterRemoval(
  annotationIds: readonly string[],
  removedId: string,
): string | null {
  const index = annotationIds.indexOf(removedId)
  if (index === -1) return null
  return annotationIds[index + 1] ?? annotationIds[index - 1] ?? null
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
