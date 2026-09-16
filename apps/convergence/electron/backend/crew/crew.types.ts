import type { SessionCrewRow } from '../database/database.types'

/**
 * One member of a crew, and the short name a baton addresses it by.
 *
 * Membership still carries no behaviour: the baton name is a label the wire
 * editor reads to pre-fill a condition with `BATON: <name>`, never something
 * the engine routes on. The engine only ever compares a wire's stored token
 * against a message's last line.
 */
/** What a seat is for. A crew's own names are local; these are the shapes. */
export type SessionCrewMemberRole =
  | 'mastermind'
  | 'horse'
  | 'reviewer'
  | 'designer'
/** A resident seat IS a conversation; a dynamic seat is a recipe for one. */
export type SessionCrewMemberKind = 'resident' | 'dynamic'
/** Where a seat works: the project's own checkout, or a worktree of its own. */
export type SessionCrewMemberLane = 'main' | 'own-worktree'

export const DEFAULT_CREW_MEMBER_ROLE: SessionCrewMemberRole = 'horse'
export const DEFAULT_CREW_MEMBER_KIND: SessionCrewMemberKind = 'resident'
export const DEFAULT_CREW_MEMBER_WIP_LIMIT = 1

/**
 * What a seat is before anybody describes it: the reading every row written
 * before seats existed gets at the door (R1). One spelling, so a test and the
 * service cannot disagree about what "an old member" means.
 */
export const DEFAULT_CREW_MEMBER_SEAT = {
  role: DEFAULT_CREW_MEMBER_ROLE,
  kind: DEFAULT_CREW_MEMBER_KIND,
  roleCard: null,
  hostPolicy: null,
  lanePolicy: null,
  wipLimit: DEFAULT_CREW_MEMBER_WIP_LIMIT,
  providerId: null,
  model: null,
}

export interface SessionCrewMember {
  /**
   * The conversation this seat is, or null for a dynamic seat: a recipe has
   * no session until a wire spawns one (R3).
   */
  sessionId: string | null
  batonName: string | null
  /**
   * Where this member's card sits on the Canvas, or null when nobody has
   * moved it (R10).
   *
   * Null is load-bearing rather than a gap: the automatic layout still places
   * an unmoved card, so a crew somebody has never arranged draws exactly as it
   * always did, and a conversation added today lands somewhere readable
   * instead of on top of the first card.
   */
  canvasX: number | null
  canvasY: number | null
  /** What this seat is for; an older row reads as a horse. */
  role: SessionCrewMemberRole
  /** Whether this seat is a conversation or a recipe; older rows are resident. */
  kind: SessionCrewMemberKind
  /**
   * What this seat is told it is, carried by the first message of a run (R4).
   * Null is a seat nobody has described -- the wire sends its payload alone,
   * exactly as it did before seats existed.
   */
  roleCard: string | null
  /** `local` or an execution-host endpoint id; null takes the app's default. */
  hostPolicy: string | null
  lanePolicy: SessionCrewMemberLane | null
  /** How many issues this seat may hold at once; an older row holds one. */
  wipLimit: number
  /** A dynamic seat's recipe. Null on a resident seat, which has a session. */
  providerId: string | null
  model: string | null
}

/**
 * A crew is a named, decorated, cross-project collection of sessions.
 * Membership is many-to-many and carries no behaviour: crews promise
 * membership only, never automation, dispatch, or relays.
 */
export interface SessionCrew {
  id: string
  name: string
  emoji: string | null
  accentColor: string | null
  position: number
  /**
   * How many hops this crew's loop may spend before the round guard trips, or
   * null to take the default. Per crew because a loop is a crew's, not the
   * app's: one crew's twelve rounds are another's two.
   */
  roundCap: number | null
  /**
   * How long a station may hold this crew's loop before it hails, in minutes,
   * or null to take the default.
   */
  stallMinutes: number | null
  /** Last successful export destination; absent on older snapshots. */
  lastExportPath?: string | null
  createdAt: string
  updatedAt: string
  /** Members whose session still exists, oldest membership first. */
  sessionIds: string[]
  /** The same members, with the short name a baton addresses each by. */
  members: SessionCrewMember[]
}

export interface CreateSessionCrewInput {
  name: string
  emoji?: string | null
  accentColor?: string | null
  sessionIds?: string[]
}

export interface UpdateSessionCrewInput {
  name?: string
  emoji?: string | null
  accentColor?: string | null
  position?: number
  roundCap?: number | null
  stallMinutes?: number | null
}

export function sessionCrewFromRow(
  row: SessionCrewRow,
  members: SessionCrewMember[],
): SessionCrew {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    accentColor: row.accent_color,
    position: row.position,
    // Read defensively: a row written before the knobs existed has no value on
    // some sqlite paths, and "take the default" is the honest answer for it.
    roundCap: row.round_cap ?? null,
    stallMinutes: row.stall_minutes ?? null,
    lastExportPath: row.last_export_path ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Kept beside `members` rather than derived at every call site: every
    // existing reader asks for the ids, and one of the two would have drifted
    // the moment somebody filtered the other. A dynamic seat has no session
    // and so appears in `members` only -- every existing reader of
    // `sessionIds` means "the conversations in this crew".
    //
    // That is why a recipe does not appear on the Canvas, in the member count
    // or among the endpoints a wire may be drawn between: those read the
    // conversations. Intended for now; a recipe's own surface rides MAR-3099.
    sessionIds: members.flatMap((member) =>
      member.sessionId === null ? [] : [member.sessionId],
    ),
    members,
  }
}
