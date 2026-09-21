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

/** A seat, as far as this rule cares: the conversation it is, or none. */
export interface LoomFollowSeat {
  sessionId: string | null
}

/**
 * A crew this rule may answer with.
 *
 * It carries its own `bound` rather than being handed a pre-filtered list:
 * "an unbound crew is never an answer" is then a claim of THIS function,
 * provable here by mutation, instead of a habit every caller has to keep.
 */
export interface LoomFollowCrew {
  id: string
  /** Whether the crew reads a tracker; an unbound crew has no Loom to show. */
  bound: boolean
  members: readonly LoomFollowSeat[]
}

/** A conversation, as far as this rule cares. */
export interface LoomFollowSession {
  id: string
  projectId: string | null
}

/** The one of a set to answer with: the crew already shown, else the first. */
function preferCurrent(
  found: readonly LoomFollowCrew[],
  current: string | null,
): string | null {
  if (found.length === 0) return null
  if (current !== null && found.some((crew) => crew.id === current)) {
    return current
  }
  return found[0]!.id
}

/**
 * Which crew is a conversation's Loom (R1), or `null` when none is.
 *
 * Two questions in order, and the order is the rule. A conversation that IS a
 * seat of a crew belongs to that crew however many other crews happen to work
 * in the same project -- a horse's own conversation is the clearest possible
 * statement of which loom it rides in. Only when no crew seats it does the
 * project decide, and then only through a seat whose conversation the app can
 * actually see: `projectId` equal and non-null on both sides, because "two
 * conversations with no project" is not a project they share.
 *
 * `null` is not a failure: it is "this conversation has no Loom of its own",
 * and the board's answer to that is to leave Loom where it was.
 */
export function loomCrewForConversation(input: {
  /** The open conversation, or null when the app cannot see one. */
  session: LoomFollowSession | null
  /** Every crew, in crew order; the unbound are refused here. */
  crews: readonly LoomFollowCrew[]
  /** Every conversation the app holds, for the seats' projects. */
  sessions: readonly LoomFollowSession[]
  /** The crew on screen now, which wins any tie it is part of. */
  current: string | null
}): string | null {
  const { session, current } = input
  if (session === null) return null
  const crews = input.crews.filter((crew) => crew.bound)

  const seatOf = crews.filter((crew) =>
    crew.members.some((member) => member.sessionId === session.id),
  )
  if (seatOf.length > 0) return preferCurrent(seatOf, current)

  const projectId = session.projectId
  if (projectId === null) return null
  const projectById = new Map(
    input.sessions.map((entry) => [entry.id, entry.projectId]),
  )
  const sameProject = crews.filter((crew) =>
    crew.members.some(
      (member) =>
        member.sessionId !== null &&
        projectById.get(member.sessionId) === projectId,
    ),
  )
  return preferCurrent(sameProject, current)
}

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
