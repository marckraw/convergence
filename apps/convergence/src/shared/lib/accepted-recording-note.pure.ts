/**
 * The note that records a lost recording of an accepted turn (MAR-3023).
 *
 * Once a provider has accepted a turn, a local persistence failure while
 * recording it is its own outcome — the turn still ran, so the honest record
 * is a note saying what was lost and where the truth lives, never a failed
 * send and never an invitation to resend.
 *
 * The text lives here, in `src/shared/`, because the backend writes the note
 * and the renderer renders it: both sides import one builder, and the format
 * is judged rendered (the MAR-2280 law — see
 * `accepted-recording-note.render.test.tsx`).
 */
export interface RecordingFailedNoteInput {
  /** The turn whose recording was lost, when it is known. */
  turnId: string | null
  /** What Convergence could not save, in the write's own words. */
  label: string
}

export function buildRecordingFailedNoteText(
  input: RecordingFailedNoteInput,
): string {
  const turn = input.turnId ? ` (turn ${input.turnId})` : ''
  return [
    `This turn was accepted and may still be running, but Convergence could not save ${input.label} to the local conversation record${turn}.`,
    'The local transcript for this turn may be incomplete. The provider\u2019s own transcript is the source of truth for what happened in it.',
    'The message was sent; do not resend it because of this warning.',
  ].join(' ')
}
