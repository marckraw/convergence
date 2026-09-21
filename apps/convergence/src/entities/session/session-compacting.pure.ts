import type { ActivitySignal } from './session.types'

/** What every surface says while a conversation compacts (MAR-3288 R5). */
export const COMPACTING_CONTEXT_LABEL = 'Compacting context…'

/**
 * Whether this conversation is compacting its context RIGHT NOW (MAR-3288 R5).
 *
 * A STATE, not an event: true from the patch at the top of the backend's
 * `compactContext` until either of its exits clears the activity. For that
 * whole window the status still reads what the last turn left -- `completed`
 * -- and the attention still reads `finished`, so a surface that turns those
 * two into a word calls a busy conversation "Finished" and offers to
 * acknowledge it. Every such surface asks THIS first, so they cannot drift
 * into disagreeing about what compacting looks like.
 */
export function isSessionCompacting(
  session: { activity?: ActivitySignal } | null | undefined,
): boolean {
  return session?.activity === 'compacting'
}
