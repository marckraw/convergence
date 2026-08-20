/**
 * The words and the wire tag for a conversation restarting underneath a
 * session (F9).
 *
 * Convergence never clears its own transcript: everything the user has read
 * stays on screen forever. When a provider mints a new conversation mid-
 * session -- `/clear` does exactly this, and a relay opener does it on
 * purpose -- the transcript therefore goes on implying a continuity the model
 * no longer has. This marker is where that lie stops.
 *
 * Named here rather than typed in the adapters because it is provider-neutral
 * by design: any adapter that notices its conversation id being replaced
 * mid-flight should emit the same boundary, and the renderer recognises one
 * tag rather than a list of per-provider spellings.
 */
export const SESSION_RESTARTED_EVENT_TYPE = 'session.restarted'

/**
 * Deliberately says what it means for the reader rather than what happened to
 * the process: "a new session id was minted" is true and useless, while
 * "everything above is invisible to the model now" is the thing that changes
 * what the user should type next.
 */
export const CONTEXT_RESTARTED_NOTE_TEXT =
  'Context cleared — the conversation restarted fresh. Everything above this point is still here to read, but the model can no longer see it.'
