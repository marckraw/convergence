import type { ResponseAnnotationDraft } from '@/entities/response-annotation'

/**
 * Fourteen annotations, the count Marcin hit in his QA reply (MAR-3004).
 *
 * Mixed on purpose so the captured payload exercises every branch of the
 * compiler: both messages (the "earlier message" label), comments and 👍
 * reactions, a multi-line quote (per-line `>`), a CRLF quote, and bodies long
 * enough that a compact pill has to cut them.
 */
export function fourteenAnnotationDrafts(ids: {
  latest: string
  earlier: string
}): ResponseAnnotationDraft[] {
  const draft = (
    messageId: string,
    quotedText: string,
    body: string,
    kind: ResponseAnnotationDraft['kind'] = 'comment',
  ): ResponseAnnotationDraft => ({
    messageId,
    quotedText,
    prefix: '',
    suffix: '',
    body,
    kind,
  })
  return [
    draft(
      ids.latest,
      'I rewrote the scheduler so retries back off exponentially.',
      'Why exponential rather than jittered?',
    ),
    draft(
      ids.latest,
      'The migration runs in a single transaction.',
      '👍',
      'reaction',
    ),
    draft(
      ids.earlier,
      'The cache is warmed on boot',
      'Can we defer this until first use?',
    ),
    draft(ids.latest, 'retries back off', 'Cap the maximum delay, please.'),
    draft(
      ids.latest,
      'Line one of a quote\nLine two of the same quote',
      'Both lines matter here.',
    ),
    draft(ids.earlier, 'which costs about a second.', '👍', 'reaction'),
    draft(
      ids.latest,
      'single transaction',
      'What happens if it times out halfway through the batch?',
    ),
    draft(
      ids.latest,
      'A quote with a Windows\r\nline ending',
      'CRLF should survive as two quoted lines.',
    ),
    draft(
      ids.latest,
      'exponentially',
      'Say the base and the factor in the docblock.',
    ),
    draft(
      ids.earlier,
      'warmed on boot',
      'Is this visible in the startup trace?',
    ),
    draft(ids.latest, 'I rewrote the scheduler', '👍', 'reaction'),
    draft(ids.latest, 'The migration', 'Name the table it touches.'),
    draft(ids.earlier, 'about a second', 'Measured on which machine?'),
    draft(
      ids.latest,
      'so retries back off exponentially. The migration runs',
      'This sentence does two jobs; split it.',
    ),
  ]
}

/**
 * What TODAY's tray sent for those fourteen drafts plus the free text
 * "Thanks, all of these." — captured on `4f2166b0` (v0.58.1), before the
 * strip existed, by rendering the real surface and reading the send call
 * (MAR-3004). 1,069 bytes.
 *
 * The strip changes how annotations WAIT, never what they SAY. A layout that
 * dropped one on collapse, reordered them, or rewrote a body on expand would
 * change these bytes, so the strip's payload test compares against this
 * constant rather than against a re-compilation that would move with it.
 */
export const TODAYS_FOURTEEN_ANNOTATION_PAYLOAD =
  'Responding to specific parts of your message:\n\n> I rewrote the scheduler so retries back off exponentially.\n\nWhy exponential rather than jittered?\n\n> The migration runs in a single transaction.\n\n👍\n\n(from your earlier message)\n> The cache is warmed on boot\n\nCan we defer this until first use?\n\n> retries back off\n\nCap the maximum delay, please.\n\n> Line one of a quote\n> Line two of the same quote\n\nBoth lines matter here.\n\n(from your earlier message)\n> which costs about a second.\n\n👍\n\n> single transaction\n\nWhat happens if it times out halfway through the batch?\n\n> A quote with a Windows\n> line ending\n\nCRLF should survive as two quoted lines.\n\n> exponentially\n\nSay the base and the factor in the docblock.\n\n(from your earlier message)\n> warmed on boot\n\nIs this visible in the startup trace?\n\n> I rewrote the scheduler\n\n👍\n\n> The migration\n\nName the table it touches.\n\n(from your earlier message)\n> about a second\n\nMeasured on which machine?\n\n> so retries back off exponentially. The migration runs\n\nThis sentence does two jobs; split it.\n\nThanks, all of these.'
