/**
 * Response annotations: quote-and-comment on an agent's message (RA1).
 *
 * The domain lives in the entity layer rather than a feature slice because of
 * where its two halves sit: annotations are *created* in the transcript
 * (widget layer) and *consumed* by the composer (feature layer). FSD-lite
 * forbids feature → feature imports, so an entity is the only slice both can
 * legally reach.
 */

export type ResponseAnnotationKind = 'comment' | 'reaction'

/**
 * `sent` annotations are kept rather than deleted: the compiled message is the
 * durable record, and RA3 renders what was already said against the message.
 */
export type ResponseAnnotationState = 'pending' | 'sent'

export interface ResponseAnnotation {
  id: string
  /** The conversation item this quote came from. */
  messageId: string
  /**
   * The payload. Everything the model is shown about the anchor — the
   * highlight is decoration, this is the substance (ruling 1).
   */
  quotedText: string
  /**
   * TextQuoteSelector-style context: the text immediately before and after the
   * quote, used only to re-locate the cosmetic highlight when the same words
   * appear twice. **Never DOM offsets** — those do not survive a re-render of
   * rendered markdown.
   */
  prefix: string
  suffix: string
  /** What the human said back. An emoji, for a reaction. */
  body: string
  kind: ResponseAnnotationKind
  state: ResponseAnnotationState
  createdAt: string
}

/**
 * What a selection produces. The store owns identity, timestamp and state, so
 * a capture site cannot invent them inconsistently.
 */
export interface ResponseAnnotationDraft {
  messageId: string
  quotedText: string
  prefix: string
  suffix: string
  body: string
  kind: ResponseAnnotationKind
}
