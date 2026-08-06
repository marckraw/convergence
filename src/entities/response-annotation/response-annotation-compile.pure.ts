import type { ResponseAnnotation } from './response-annotation.types'

/**
 * The doctrine piece (RA1): what the model actually receives.
 *
 * Response annotations are provider-neutral by construction — nothing about
 * them reaches a wire, an adapter or a capability flag. They become one
 * ordinary prompt here, at the last moment before sending, which is also what
 * makes the transcript honest: the sent message shows this text verbatim, so
 * what Marcin reads afterwards is exactly what the model read.
 *
 * The tests beside this file are the specification of that format. Change them
 * only deliberately.
 */

export const RESPONSE_ANNOTATION_PROMPT_HEADER =
  'Responding to specific parts of your message:'

/**
 * Says which message a quote came from, and only when it is not the newest
 * one. Without it, a quote from three messages ago reads as a quote from the
 * message the model just wrote — the one thing a quote must never be
 * ambiguous about.
 */
export const RESPONSE_ANNOTATION_EARLIER_MESSAGE_LABEL =
  '(from your earlier message)'

/**
 * Compiles pending annotations and the composer's own text into one prompt.
 *
 * Order is the caller's, deliberately: annotations arrive in the order they
 * were captured against the document, and this function never re-sorts them by
 * `createdAt`. Reading order is a property of the transcript, which this pure
 * function cannot see — so it preserves what it is given rather than inventing
 * an order from timestamps.
 *
 * With no annotations the free text is returned **byte-identical**: a person
 * who never selected anything must not be able to tell this feature exists.
 */
export function compileAnnotationsIntoPrompt(
  annotations: readonly ResponseAnnotation[],
  freeText: string,
  latestAgentMessageId: string | null,
): string {
  const blocks = annotations
    .map((annotation) => compileBlock(annotation, latestAgentMessageId))
    .filter((block): block is string => block !== null)

  if (blocks.length === 0) return freeText

  const sections = [RESPONSE_ANNOTATION_PROMPT_HEADER, ...blocks]
  const trailing = freeText.trim()
  if (trailing) sections.push(trailing)

  return sections.join('\n\n')
}

/**
 * One quote and the response to it. Returns null for an annotation with
 * nothing to quote — a block with no quote would be a comment floating free of
 * the thing it answers, which is the failure this feature exists to end.
 */
function compileBlock(
  annotation: ResponseAnnotation,
  latestAgentMessageId: string | null,
): string | null {
  const quoted = annotation.quotedText.trim()
  if (!quoted) return null

  const lines: string[] = []
  if (
    latestAgentMessageId !== null &&
    annotation.messageId !== latestAgentMessageId
  ) {
    lines.push(RESPONSE_ANNOTATION_EARLIER_MESSAGE_LABEL)
  }

  lines.push(...quoteLines(quoted))

  // An emoji reaction is a comment with an emoji body (ruling 2), so both
  // kinds render identically here — no separate path to keep in step.
  const body = annotation.body.trim()
  if (body) lines.push(body)

  return lines.join('\n')
}

/**
 * Every line of a multi-line quote gets its own `>`. Markdown treats a bare
 * newline inside a blockquote as a lazy continuation, which silently reflows
 * the agent's own formatting — and a quote that has been reformatted is no
 * longer a quote.
 */
function quoteLines(quoted: string): string[] {
  return quoted
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
}
