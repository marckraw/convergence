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
