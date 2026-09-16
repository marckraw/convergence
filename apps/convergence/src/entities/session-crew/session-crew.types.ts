/**
 * A crew is a named, decorated, cross-project collection of sessions.
 * Membership is many-to-many and promises membership only — no automation.
 */
/** The seat fields a person types into, which therefore keep a draft. */
export type SeatDraftField = 'roleCard' | 'hostPolicy' | 'wipLimit'

/**
 * The one name every reader uses for a member: its conversation when it has
 * one, its baton name when it is a recipe (MAR-3083 R3). React keys, draft
 * maps and the refusal slot all hang off this, so a recipe and a conversation
 * cannot collide.
 */
export function memberKey(member: {
  sessionId: string | null
  batonName: string | null
}): string {
  return member.sessionId ?? `baton:${member.batonName ?? ''}`
}

/** What a seat reads as before anybody describes it (MAR-3083 R1). */
export const DEFAULT_CREW_MEMBER_SEAT = {
  role: 'horse',
  kind: 'resident',
  roleCard: null,
  hostPolicy: null,
  lanePolicy: null,
  wipLimit: 1,
  providerId: null,
  model: null,
} as const

export interface SessionCrewMember {
  /**
   * The conversation this seat is, or null for a dynamic seat — a recipe has
   * no conversation until a wire spawns one (MAR-3083 R3). A member with no
   * session is addressed by its baton name.
   */
  sessionId: string | null
  /**
   * The short name a baton addresses this member by, or null when nobody has
   * named it. A label the wire editor reads to pre-fill a condition — the
   * engine never routes on it, it compares a wire's stored token.
   */
  batonName: string | null
  /**
   * Where this member's card sits on the Canvas, or null when nobody has
   * moved it — the automatic layout places those, so a crew nobody has
   * arranged still draws readably (R10).
   */
  canvasX: number | null
  canvasY: number | null
  /** What this seat is for; an older member reads as a horse (MAR-3083). */
  role: 'mastermind' | 'horse' | 'reviewer' | 'designer'
  /** A conversation, or a recipe a wire spawns. */
  kind: 'resident' | 'dynamic'
  /** What this seat is told it is; the first message of a run carries it. */
  roleCard: string | null
  /** `local` or an execution-host endpoint id. */
  hostPolicy: string | null
  lanePolicy: 'main' | 'own-worktree' | null
  /** How many issues this seat may hold at once; an older member holds one. */
  wipLimit: number
  /** A dynamic seat's recipe; null on a resident seat. */
  providerId: string | null
  model: string | null
}

export interface SessionCrew {
  id: string
  name: string
  emoji: string | null
  accentColor: string | null
  position: number
  /** How many rounds this crew's loop may spend; null takes the default. */
  roundCap: number | null
  /** How long a station may hold the loop before it hails; null is default. */
  stallMinutes: number | null
  /** Last successful export destination; absent on older snapshots. */
  lastExportPath?: string | null
  createdAt: string
  updatedAt: string
  sessionIds: string[]
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
