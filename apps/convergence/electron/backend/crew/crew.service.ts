import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { SessionCrewRow } from '../database/database.types'
import {
  nextCrewPosition,
  normalizeCrewAccentColor,
  normalizeCrewBatonName,
  normalizeCrewEmoji,
  normalizeCrewHostPolicy,
  normalizeCrewLimit,
  normalizeCrewMemberKind,
  normalizeCrewMemberLane,
  normalizeCrewMemberRole,
  normalizeCrewName,
  normalizeCrewRecipeField,
  normalizeCrewRoleCard,
  normalizeCrewSessionIds,
} from './crew.pure'
import {
  sessionCrewFromRow,
  DEFAULT_CREW_MEMBER_ROLE,
  DEFAULT_CREW_MEMBER_WIP_LIMIT,
  type CreateSessionCrewInput,
  type SessionCrew,
  type SessionCrewMember,
  type SessionCrewMemberKind,
  type SessionCrewMemberLane,
  type SessionCrewMemberRole,
  type UpdateSessionCrewInput,
} from './crew.types'
import {
  normalizeTrackerBinding,
  type TrackerBindingInput,
} from '../tracker/tracker-binding.pure'

/**
 * How a caller names one member (MAR-3083 lap 2, C).
 *
 * A resident seat IS a conversation and is addressed by its session id. A
 * dynamic seat has no conversation at all, so its baton name -- unique in the
 * crew by the door above -- is the only name it has. Every member-scoped
 * write takes this, or a recipe would be a row nobody could edit or remove.
 */
export type CrewMemberRef = { sessionId: string } | { batonName: string }

/** What the form and the importer may set on a seat (MAR-3083 R1). */
export interface UpdateCrewSeatInput {
  role?: SessionCrewMemberRole | null
  kind?: SessionCrewMemberKind | null
  roleCard?: string | null
  hostPolicy?: string | null
  lanePolicy?: SessionCrewMemberLane | null
  wipLimit?: number | null
  providerId?: string | null
  model?: string | null
}

/** A dynamic seat is a recipe, so its provider and host are required. */
export interface CreateCrewRecipeSeatInput {
  batonName: string
  providerId: string
  model: string | null
  hostPolicy: string
  role?: SessionCrewMemberRole | null
  roleCard?: string | null
  lanePolicy?: SessionCrewMemberLane | null
  wipLimit?: number | null
}

/**
 * Repository + use-case boundary for crews. Membership rows are joined against
 * `sessions` on every read so a deleted session degrades to a missing member
 * rather than a crash, and crew deletion is spelled out row by row so it can
 * never cascade into the sessions themselves.
 */
export class CrewService {
  constructor(private db: Database.Database) {}

  list(): SessionCrew[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM session_crews
         ORDER BY position ASC, created_at ASC, rowid ASC`,
      )
      .all() as SessionCrewRow[]

    const membersByCrewId = this.readMembers()

    return rows.map((row) =>
      sessionCrewFromRow(row, membersByCrewId.get(row.id) ?? []),
    )
  }

  getById(id: string): SessionCrew | null {
    const row = this.db
      .prepare('SELECT * FROM session_crews WHERE id = ?')
      .get(id) as SessionCrewRow | undefined
    if (!row) return null
    return sessionCrewFromRow(row, this.readMembers(row.id).get(row.id) ?? [])
  }

  /** Records only a completed export; the destination is not a recipe input. */
  recordExportPath(id: string, path: string): void {
    this.db
      .prepare('UPDATE session_crews SET last_export_path=? WHERE id=?')
      .run(path, id)
  }

  create(input: CreateSessionCrewInput): SessionCrew {
    const id = randomUUID()
    const name = normalizeCrewName(input.name)
    const emoji = normalizeCrewEmoji(input.emoji)
    const accentColor = normalizeCrewAccentColor(input.accentColor)
    const sessionIds = normalizeCrewSessionIds(input.sessionIds)
    const position = nextCrewPosition(
      (
        this.db.prepare('SELECT position FROM session_crews').all() as {
          position: number
        }[]
      ).map((entry) => entry.position),
    )

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO session_crews (id, name, emoji, accent_color, position)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, name, emoji, accentColor, position)

      for (const sessionId of sessionIds) {
        this.insertMember(id, sessionId)
      }
    })()

    return this.requireById(id)
  }

  /**
   * The crew this session belongs to, as a list of at most one (R2).
   *
   * Still a list because that is the shape the engine reads and because the
   * record can briefly hold more on a database whose dedupe was refused (a
   * duplicate with an armed wire is left standing, `crew-seat-migration`).
   * The engine asks so it knows whose loop a settling session is part of: a
   * baton nobody routed has to hail the crew that was waiting on it, and that
   * crew may own no wire leaving this station at all.
   */
  crewIdsForSession(sessionId: string): string[] {
    const rows = this.db
      .prepare(
        'SELECT crew_id FROM session_crew_members WHERE session_id = ? ORDER BY added_at ASC, rowid ASC',
      )
      .all(sessionId) as { crew_id: string }[]
    return rows.map((row) => row.crew_id)
  }

  /**
   * Remembers where a member's card was dropped on the Canvas (R10).
   *
   * A null pair means "lay it out" and is how a card is put back under the
   * automatic walk; the two coordinates move together because half a position
   * is not a position. Silent when the pair names a member this crew does not
   * have -- a card dragged in a window whose membership changed under it is
   * not an error worth failing a drag over, and the next crew broadcast
   * corrects the picture.
   */
  setMemberPosition(
    crewId: string,
    sessionId: string,
    position: { x: number; y: number } | null,
  ): SessionCrew {
    this.requireRow(crewId)
    this.db
      .prepare(
        `UPDATE session_crew_members SET canvas_x = ?, canvas_y = ?
         WHERE crew_id = ? AND session_id = ?`,
      )
      .run(
        normalizeCanvasCoordinate(position?.x),
        normalizeCanvasCoordinate(position?.y),
        crewId,
        sessionId,
      )
    return this.requireById(crewId)
  }

  /**
   * Names one member's baton, or clears it.
   *
   * Its own method rather than a field on `update`, for the same reason arming
   * is: it belongs to a member, not to the crew, and burying it in the crew
   * form would mean editing a colour could rename a route.
   */
  setMemberBatonName(
    crewId: string,
    member: CrewMemberRef,
    batonName: string | null,
  ): SessionCrew {
    this.requireRow(crewId)
    const { clause, key } = memberClause(member)
    const wanted = normalizeCrewBatonName(batonName)
    // A recipe's name is the only way to reach it, so it cannot be cleared
    // (MAR-3083 lap 3, I): a row with no session and no name is un-editable
    // and un-removable for good.
    if (!wanted && this.isRecipe(crewId, clause, key)) {
      throw new Error('A dynamic seat needs a baton name')
    }
    this.refuseRecipeNameCollision(crewId, wanted, member)
    this.db
      .prepare(
        `UPDATE session_crew_members SET baton_name = ? WHERE crew_id = ? AND ${clause}`,
      )
      .run(wanted, crewId, key)
    return this.requireById(crewId)
  }

  /** Whether the row this reference names has no conversation of its own. */
  private isRecipe(crewId: string, clause: string, key: string): boolean {
    const row = this.db
      .prepare(
        `SELECT session_id FROM session_crew_members
          WHERE crew_id = ? AND ${clause}`,
      )
      .get(crewId, key) as { session_id: string | null } | undefined
    return row !== undefined && row.session_id === null
  }

  update(id: string, patch: UpdateSessionCrewInput): SessionCrew {
    const existing = this.requireRow(id)

    const name =
      patch.name === undefined ? existing.name : normalizeCrewName(patch.name)
    const emoji =
      patch.emoji === undefined
        ? existing.emoji
        : normalizeCrewEmoji(patch.emoji)
    const accentColor =
      patch.accentColor === undefined
        ? existing.accent_color
        : normalizeCrewAccentColor(patch.accentColor)
    const position =
      patch.position === undefined ? existing.position : patch.position
    // An untouched knob survives an edit that was about something else;
    // clearing one back to the default is an explicit null, the same shape
    // every other optional field here uses.
    const roundCap =
      patch.roundCap === undefined
        ? existing.round_cap
        : normalizeCrewLimit(patch.roundCap, 'A round cap')
    const stallMinutes =
      patch.stallMinutes === undefined
        ? existing.stall_minutes
        : normalizeCrewLimit(patch.stallMinutes, 'A stall window')

    this.db
      .prepare(
        `UPDATE session_crews
         SET name = ?,
             emoji = ?,
             accent_color = ?,
             position = ?,
             round_cap = ?,
             stall_minutes = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(name, emoji, accentColor, position, roundCap, stallMinutes, id)

    return this.requireById(id)
  }

  /**
   * Binds this crew to a tracker, or unbinds it with null (MAR-3084 R3). The
   * binding carries no secret; the key is set through the tracker credentials
   * door, filed under this crew's id.
   */
  setTrackerBinding(
    crewId: string,
    binding: TrackerBindingInput | null,
  ): SessionCrew {
    this.requireRow(crewId)
    const normalized =
      binding === null ? null : normalizeTrackerBinding(binding)
    this.db
      .prepare(
        `UPDATE session_crews
         SET tracker_kind = ?,
             tracker_project_id = ?,
             tracker_label_prefix = ?,
             tracker_wave_prefix = ?,
             tracker_status_map_json = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        normalized?.kind ?? null,
        normalized?.projectId ?? null,
        normalized?.labelPrefix ?? null,
        normalized?.wavePrefix ?? null,
        normalized ? JSON.stringify(normalized.statusMap) : null,
        crewId,
      )
    return this.requireById(crewId)
  }

  /** The stamp records an applied recipe hash, not success of later guarded model changes. */
  stampConfig(id: string, path: string, sha256: string): void {
    this.requireRow(id)
    this.db
      .prepare(
        'UPDATE session_crews SET config_path=?,config_sha256=?,config_applied_at=? WHERE id=?',
      )
      .run(path, sha256, new Date().toISOString(), id)
  }

  delete(id: string): void {
    this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM session_crew_members WHERE crew_id = ?')
        .run(id)
      this.db.prepare('DELETE FROM session_crews WHERE id = ?').run(id)
    })()
  }

  addMember(crewId: string, sessionId: string): SessionCrew {
    this.requireRow(crewId)
    const [normalized] = normalizeCrewSessionIds([sessionId])
    if (!normalized) {
      throw new Error('Crew member session id cannot be empty')
    }
    this.insertMember(crewId, normalized)
    return this.requireById(crewId)
  }

  removeMember(crewId: string, member: CrewMemberRef): SessionCrew {
    this.requireRow(crewId)
    const { clause, key } = memberClause(member)
    this.db
      .prepare(
        `DELETE FROM session_crew_members WHERE crew_id = ? AND ${clause}`,
      )
      .run(crewId, key)
    return this.requireById(crewId)
  }

  private insertMember(crewId: string, sessionId: string): void {
    // This crew re-adding a member it already has stays the no-op it was.
    // Spelled as a read rather than `INSERT OR IGNORE`, because that form
    // swallows the unique index's refusal too -- with it, the index below
    // could never refuse anything and the second half of R2 was decoration.
    const already = this.db
      .prepare(
        'SELECT 1 FROM session_crew_members WHERE crew_id = ? AND session_id = ?',
      )
      .get(crewId, sessionId)
    if (already) return
    this.refuseSecondCrew(crewId, sessionId)
    this.db
      .prepare(
        `INSERT INTO session_crew_members (crew_id, session_id)
         VALUES (?, ?)`,
      )
      .run(crewId, sessionId)
  }

  /**
   * One seat, one crew (R2; constitution §6.6) -- said in words.
   *
   * The unique index in `crew-seat-migration.service.ts` refuses the same row
   * whatever writes it; this is the half that can NAME the crew the
   * conversation already sits in, which is the only thing a person needs in
   * order to act on it. Both are named because they see different inputs: the
   * index also catches a writer that never came through this service.
   */
  private refuseSecondCrew(crewId: string, sessionId: string): void {
    const existing = this.db
      .prepare(
        `SELECT crews.name AS name
           FROM session_crew_members members
           JOIN session_crews crews ON crews.id = members.crew_id
          WHERE members.session_id = ? AND members.crew_id <> ?
          ORDER BY members.added_at ASC, members.rowid ASC
          LIMIT 1`,
      )
      .get(sessionId, crewId) as { name: string } | undefined
    if (existing) {
      throw new Error(
        `This conversation is already in the crew "${existing.name}"`,
      )
    }
  }

  /**
   * A dynamic seat: a recipe with no conversation until a wire spawns one.
   *
   * Addressed by its baton name, because that is the only name it has -- and
   * the name a wire's spawn spec uses to find it (R3).
   */
  addRecipeMember(
    crewId: string,
    input: CreateCrewRecipeSeatInput,
  ): SessionCrew {
    this.requireRow(crewId)
    const batonName = normalizeCrewBatonName(input.batonName)
    if (!batonName) throw new Error('A dynamic seat needs a baton name')
    this.refuseRecipeNameCollision(crewId, batonName)
    const providerId = normalizeCrewRecipeField(input.providerId)
    const hostPolicy = normalizeCrewHostPolicy(input.hostPolicy)
    if (!providerId || !hostPolicy) {
      throw new Error('A dynamic seat needs a provider and a host')
    }
    this.db
      .prepare(
        `INSERT INTO session_crew_members
           (crew_id, session_id, baton_name, role, kind, role_card,
            host_policy, lane_policy, wip_limit, provider_id, model)
         VALUES (?, NULL, ?, ?, 'dynamic', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crewId,
        batonName,
        normalizeCrewMemberRole(input.role) ?? DEFAULT_CREW_MEMBER_ROLE,
        normalizeCrewRoleCard(input.roleCard),
        hostPolicy,
        normalizeCrewMemberLane(input.lanePolicy),
        normalizeCrewLimit(input.wipLimit, 'A WIP limit'),
        providerId,
        normalizeCrewRecipeField(input.model),
      )
    return this.requireById(crewId)
  }

  /**
   * The RECIPE a spawn spec names (MAR-3083 R3, lap 3 H).
   *
   * Recipes only, for the same reason `memberClause` is: a resident sharing
   * the name would otherwise be resolved as the seat a wire spawns, and the
   * wire would open a session on a conversation's own settings.
   */
  findMemberByBatonName(
    crewId: string,
    batonName: string,
  ): SessionCrewMember | null {
    const wanted = normalizeCrewBatonName(batonName)
    if (!wanted) return null
    const members = this.readMembers(crewId).get(crewId) ?? []
    return (
      members.find(
        (member) => member.sessionId === null && member.batonName === wanted,
      ) ?? null
    )
  }

  /**
   * Refuses a name a recipe in this crew already holds (H).
   *
   * Every door that sets a baton name asks whether a RECIPE in this crew holds
   * it: a name is a recipe's only key, so a second row taking it would make
   * the recipe unaddressable behind it. A recipe taking a resident's name is
   * not refused and needs no refusal -- no route resolves a name to a
   * resident.
   */
  private refuseRecipeNameCollision(
    crewId: string,
    batonName: string | null,
    exclude?: CrewMemberRef,
  ): void {
    if (!batonName) return
    const held = this.findMemberByBatonName(crewId, batonName)
    if (!held) return
    if (
      exclude &&
      'batonName' in exclude &&
      normalizeCrewBatonName(exclude.batonName) === held.batonName
    ) {
      return
    }
    throw new Error(`This crew already has a seat named "${batonName}"`)
  }

  /**
   * Edits what a seat IS, one field at a time.
   *
   * Its own method for the same reason the baton name has one: it belongs to a
   * member, not to the crew, and folding it into `update` would mean editing a
   * colour could change what a conversation is told it is. An undefined field
   * is untouched; an explicit null clears it back to the default.
   */
  setMemberSeat(
    crewId: string,
    member: CrewMemberRef,
    patch: UpdateCrewSeatInput,
  ): SessionCrew {
    this.requireRow(crewId)
    const { clause, key } = memberClause(member)
    const assignments: string[] = []
    const values: (string | number | null)[] = []
    const set = (column: string, value: string | number | null): void => {
      assignments.push(`${column} = ?`)
      values.push(value)
    }
    if (patch.role !== undefined)
      set('role', normalizeCrewMemberRole(patch.role))
    if (patch.kind !== undefined) {
      // `kind` is not a field anybody sets: it follows the row. A patch may
      // state it (an importer echoing what it read), and it is refused when
      // it disagrees rather than written and ignored.
      const stated = normalizeCrewMemberKind(patch.kind)
      const actual = this.isRecipe(crewId, clause, key) ? 'dynamic' : 'resident'
      if (stated && stated !== actual) {
        throw new Error(
          `This seat is ${actual}: a seat is dynamic exactly when it has no conversation`,
        )
      }
      set('kind', actual)
    }
    if (patch.roleCard !== undefined)
      set('role_card', normalizeCrewRoleCard(patch.roleCard))
    if (patch.hostPolicy !== undefined)
      set('host_policy', normalizeCrewHostPolicy(patch.hostPolicy))
    if (patch.lanePolicy !== undefined)
      set('lane_policy', normalizeCrewMemberLane(patch.lanePolicy))
    if (patch.wipLimit !== undefined)
      set('wip_limit', normalizeCrewLimit(patch.wipLimit, 'A WIP limit'))
    if (patch.providerId !== undefined)
      set('provider_id', normalizeCrewRecipeField(patch.providerId))
    if (patch.model !== undefined)
      set('model', normalizeCrewRecipeField(patch.model))
    if (assignments.length === 0) return this.requireById(crewId)
    this.db
      .prepare(
        `UPDATE session_crew_members SET ${assignments.join(', ')}
          WHERE crew_id = ? AND ${clause}`,
      )
      .run(...values, crewId, key)
    return this.requireById(crewId)
  }

  private readMembers(crewId?: string): Map<string, SessionCrewMember[]> {
    const rows = (
      crewId === undefined
        ? this.db.prepare(`${MEMBER_SELECT} ${MEMBER_ORDER}`).all()
        : this.db
            .prepare(`${MEMBER_SELECT} AND members.crew_id = ? ${MEMBER_ORDER}`)
            .all(crewId)
    ) as MemberReadRow[]

    const membersByCrewId = new Map<string, SessionCrewMember[]>()
    for (const row of rows) {
      const member: SessionCrewMember = {
        sessionId: row.session_id,
        // Every seat column reads defensively and defaults at the door: a row
        // written before seats existed chose none of them, and `horse ·
        // resident · 1` is how it has always behaved (R1).
        //
        // A word the record holds and this build does not know is READ as the
        // default and said out loud once, never thrown on: the write door
        // refuses an unknown word (`setMemberSeat`), but a row can arrive from
        // a newer build, a hand edit or a foreign writer, and one such row must
        // not take the whole crew surface down with it.
        role:
          readSeatWord(row, 'role', normalizeCrewMemberRole) ??
          DEFAULT_CREW_MEMBER_ROLE,
        // DERIVED, never read from the column (MAR-3083 lap 3, J): a seat is
        // a recipe exactly when it has no conversation. The column is a
        // mirror the doors keep for readability; a write that disagreed with
        // the row used to make a recipe vanish from every read, and its name
        // -- its only key -- free for a second row to take.
        kind: row.session_id === null ? 'dynamic' : 'resident',
        roleCard: row.role_card ?? null,
        hostPolicy: row.host_policy ?? null,
        lanePolicy: readSeatWord(row, 'lane_policy', normalizeCrewMemberLane),
        wipLimit:
          typeof row.wip_limit === 'number' && Number.isInteger(row.wip_limit)
            ? row.wip_limit
            : DEFAULT_CREW_MEMBER_WIP_LIMIT,
        providerId: row.provider_id ?? null,
        model: row.model ?? null,
        conversationMissing: row.conversation_missing === 1,
        // Defensive read for the same reason every other added column gets
        // one: a row written before baton names existed has none.
        batonName: row.baton_name ?? null,
        // Both or neither: half a position cannot place a card, and reading
        // one coordinate as 0 would drag it to the edge of the frame.
        canvasX: readCanvasCoordinate(row.canvas_x, row.canvas_y),
        canvasY: readCanvasCoordinate(row.canvas_y, row.canvas_x),
      }
      const existing = membersByCrewId.get(row.crew_id)
      if (existing) {
        existing.push(member)
      } else {
        membersByCrewId.set(row.crew_id, [member])
      }
    }
    return membersByCrewId
  }

  private requireRow(id: string): SessionCrewRow {
    const row = this.db
      .prepare('SELECT * FROM session_crews WHERE id = ?')
      .get(id) as SessionCrewRow | undefined
    if (!row) {
      throw new Error(`Crew not found: ${id}`)
    }
    return row
  }

  private requireById(id: string): SessionCrew {
    const crew = this.getById(id)
    if (!crew) {
      throw new Error(`Crew not found: ${id}`)
    }
    return crew
  }
}

/**
 * The WHERE half that names one member (MAR-3083 lap 2, C).
 *
 * A session-keyed update could never reach a recipe: its `session_id` is null,
 * and `= NULL` matches nothing, so every edit and every removal was a silent
 * no-op on exactly the rows R3 introduced.
 */
function memberClause(member: CrewMemberRef): { clause: string; key: string } {
  if ('sessionId' in member) {
    return { clause: 'session_id = ?', key: member.sessionId }
  }
  const batonName = normalizeCrewBatonName(member.batonName)
  if (!batonName) throw new Error('A crew member reference cannot be empty')
  // A baton name addresses RECIPES ONLY (MAR-3083 lap 3, H). A resident's key
  // is its conversation, and residents may share a baton name with each other
  // as they always could -- so a bare `baton_name = ?` matched a resident and
  // a recipe of the same name together: one edit changed both rows, one
  // removal deleted both. A name is a key only among rows that have no other.
  return { clause: 'session_id IS NULL AND baton_name = ?', key: batonName }
}

/**
 * One seat word as this build reads it, or the default when the record holds
 * something this build does not know (MAR-3083 lap 2, B).
 *
 * The door that WRITES still refuses an unknown word -- a silently corrected
 * role would read back as a seat somebody chose. The door that READS cannot
 * afford to: `list()` feeds every crew surface, and one junk row used to throw
 * the lot. The row is named in the warning so the value can be found and
 * fixed, rather than disappearing into a default nobody was told about.
 */
function readSeatWord<T>(
  row: {
    crew_id: string
    session_id: string | null
    baton_name: string | null
  },
  column: 'role' | 'kind' | 'lane_policy',
  normalize: (value: string | null | undefined) => T | null,
): T | null {
  const value = (row as unknown as Record<string, string | null>)[column]
  try {
    return normalize(value)
  } catch (error) {
    console.warn(
      `[crew] crew ${row.crew_id}: member ${
        row.session_id ?? row.baton_name ?? '(unnamed)'
      } holds an unreadable ${column} (${String(value)}); reading the default. ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return null
  }
}

/**
 * Members with their seat, resident and dynamic alike.
 *
 * A LEFT JOIN rather than the inner one it was: a dynamic seat has no session
 * to join to, and an inner join hid every recipe in the crew.
 *
 * A resident seat whose conversation was deleted is READ, not hidden
 * (MAR-3118 R10): `conversation_missing` says so, derived from the join and
 * never stored. Hiding it left a seat a wire still aimed at with nothing on
 * the screen to show for it or to remove.
 */
const MEMBER_SELECT = `SELECT members.crew_id, members.session_id, members.baton_name,
          members.canvas_x, members.canvas_y, members.role, members.kind,
          members.role_card, members.host_policy, members.lane_policy,
          members.wip_limit, members.provider_id, members.model,
          (members.session_id IS NOT NULL AND sessions.id IS NULL) AS conversation_missing
     FROM session_crew_members members
     LEFT JOIN sessions ON sessions.id = members.session_id
    WHERE 1 = 1`
const MEMBER_ORDER = 'ORDER BY members.added_at ASC, members.rowid ASC'

interface MemberReadRow {
  crew_id: string
  session_id: string | null
  baton_name: string | null
  canvas_x: number | null
  canvas_y: number | null
  role: string | null
  kind: string | null
  role_card: string | null
  host_policy: string | null
  lane_policy: string | null
  wip_limit: number | null
  provider_id: string | null
  model: string | null
  conversation_missing: number
}

/**
 * A coordinate worth storing, or null.
 *
 * The belt of a belt-and-braces pair, and it says so rather than claiming to
 * be the guard: **`readCanvasCoordinate` below is the load-bearing half.**
 * Deleting this function alone leaves every test green, because the read
 * refuses the same rows -- a stored Infinity comes back and is dropped there,
 * and SQLite turns a NaN into NULL on its own before this is even asked.
 *
 * It stays because a row nobody can read is still a row somebody has to
 * explain, and refusing junk at the door is cheaper than explaining it. The
 * rule it enforces is the read's: a non-finite coordinate is a card gone off
 * the canvas with no way to find it, and null -- the automatic walk -- is
 * always somewhere visible.
 */
function normalizeCanvasCoordinate(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

/**
 * One half of a stored pair, kept only when its partner is there too.
 *
 * THE guard. Half a position cannot place a card, and reading one coordinate
 * as 0 would drag it to the edge of its frame -- which looks like a bug
 * rather than an arrangement. It also catches a non-finite value however it
 * got into the column, including from a build that wrote it before the door
 * above existed.
 */
function readCanvasCoordinate(
  value: number | null,
  partner: number | null,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (typeof partner !== 'number' || !Number.isFinite(partner)) return null
  return value
}
