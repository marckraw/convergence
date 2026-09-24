/**
 * Loom follows the open conversation (MAR-3291).
 *
 * Marcin works across several projects, each with its own crew and its own
 * tracker. Loom shows ONE crew (MAR-3225), and until now that crew changed
 * only when he changed it by hand -- so walking from a segmemo conversation
 * to a convergence one left the ledger of the project he had left on screen
 * beside the conversation he was reading.
 *
 * A crew has no project of its own: `SessionCrew` is an id, a name, seats and
 * a tracker binding. A crew's project can therefore only be read off its
 * SEATS' conversations, which is what `loomCrewForConversation` does.
 */

/** What the toggle is called, wherever it is named (R3). */
export const LOOM_FOLLOW_LABEL = 'Follow the conversation'

export { loomCrewForConversation } from '@/entities/loom-navigation'
export type {
  LoomFollowCrew,
  LoomFollowSession,
} from '@/entities/loom-navigation'

/**
 * Which conversation is on screen (R2), or `null` when none is.
 *
 * The app keeps two of them -- a project's conversation and a global chat --
 * and which one a person is actually reading is the SURFACE's answer, not a
 * property of either id: the other one keeps its last value while the surface
 * it belongs to is not drawn. The same derivation the sidebar already makes
 * for the row it highlights (`sidebar.container.tsx`, `activeSessionId={…}`
 * on `NeedsYou`), written once here so Loom and the sidebar cannot come to
 * disagree about which conversation is open.
 */
export function openConversationId(input: {
  surface: 'code' | 'chat'
  activeSessionId: string | null
  activeGlobalSessionId: string | null
}): string | null {
  return input.surface === 'chat'
    ? input.activeGlobalSessionId
    : input.activeSessionId
}

const FOLLOW_ON = '1'

/**
 * Reads the stored preference (R3). Only the one value it writes means on:
 * anything else -- absent, empty, a value from some later shape of this
 * preference -- is the OFF this feature defaults to.
 */
export function parseLoomFollow(raw: string | null): boolean {
  return raw === FOLLOW_ON
}

/** What "on" is written as; "off" is the absence of the key. */
export function serializeLoomFollow(): string {
  return FOLLOW_ON
}
