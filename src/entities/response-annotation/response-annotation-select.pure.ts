import type { ResponseAnnotation } from './response-annotation.types'

/**
 * Reads over a session's annotations. Pure so the rules are testable without a
 * store, and so a component can hold the store's stable array and derive from
 * it in a `useMemo` rather than returning a fresh array from a selector on
 * every render.
 */

/** What the tray shows and the next send will compile. */
export function selectPendingAnnotations(
  annotations: readonly ResponseAnnotation[],
): ResponseAnnotation[] {
  return annotations.filter((annotation) => annotation.state === 'pending')
}

/**
 * Everything anchored to one message, in any state.
 *
 * Sent annotations are included deliberately: they are what RA3 paints back
 * onto a past message, and a decoration that vanished the moment it was sent
 * would lose the record of the conversation having happened.
 */
export function selectAnnotationsForMessage(
  annotations: readonly ResponseAnnotation[],
  messageId: string,
): ResponseAnnotation[] {
  return annotations.filter((annotation) => annotation.messageId === messageId)
}
