import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { CrewHailRow } from '../database/database.types'
import { crewHailFromRow } from './crew-hail.types'
import type { CrewHail, RaiseCrewHailInput } from './crew-hail.types'

/**
 * How much of a finishing message a hail keeps.
 *
 * The whole thing would put a transcript in a notification; a sentence would
 * put a teaser there. This is enough to read the verdict that parked the loop
 * without opening anything.
 */
export const MAX_CREW_HAIL_MESSAGE_LENGTH = 4000

/**
 * Repository for the calls a crew makes on Marcin.
 *
 * Beside the ledger rather than inside it, and no foreign keys, for the same
 * reason the rest of this neighbourhood has none: a hail about a session that
 * has since been deleted must still read.
 */
export class CrewHailService {
  constructor(private db: Database.Database) {}

  /** Every hail still asking, newest first. */
  listOpen(): CrewHail[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM crew_hails
         WHERE acknowledged_at IS NULL
         ORDER BY raised_at DESC, rowid DESC`,
      )
      .all() as CrewHailRow[]
    return rows.map(crewHailFromRow)
  }

  /**
   * Raises one, or returns null because this crew is already asking (or has
   * already been answered) about exactly this.
   *
   * Two dedupe rules, one per shape of question:
   *
   * - A hail that names an accused HOP dedupes on that identity, and on it
   *   ALONE, including acknowledged rows (MAR-2759). The frozen rule is that
   *   a stall "re-arms after the next hop": answering the call is Marcin
   *   saying "I know about THIS debt", and the timer reading the same hop a
   *   minute later must stay silent -- minute-by-minute nagging about an
   *   acknowledged alarm is noise wearing an alarm's clothes. A NEW hop is a
   *   new identity and re-arms on its own.
   * - A hail with no hop dedupes as before: at most one OPEN call per crew,
   *   reason, station and flow run, and answering it clears the way for the
   *   next.
   */
  raise(input: RaiseCrewHailInput): CrewHail | null {
    const existing = input.hopId
      ? (this.db
          .prepare('SELECT id FROM crew_hails WHERE hop_id = ?')
          .get(input.hopId) as { id: string } | undefined)
      : (this.db
          .prepare(
            `SELECT id FROM crew_hails
             WHERE acknowledged_at IS NULL
               AND crew_id = ?
               AND reason = ?
               AND session_id = ?
               AND flow_run_id IS ?`,
          )
          .get(
            input.crewId,
            input.reason,
            input.sessionId,
            input.flowRunId ?? null,
          ) as { id: string } | undefined)
    if (existing) return null

    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO crew_hails (
           id, crew_id, flow_run_id, reason, session_id, baton, message,
           detail, hop_id, raised_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.crewId,
        input.flowRunId ?? null,
        input.reason,
        input.sessionId,
        input.baton ?? null,
        truncateHailMessage(input.message ?? null),
        input.detail,
        input.hopId ?? null,
        new Date().toISOString(),
      )

    return this.requireById(id)
  }

  /**
   * Answers one hail. Kept rather than deleted: a loop that parked three times
   * this week is a fact about the crew, and the row is the only place it lives.
   */
  acknowledge(id: string): void {
    this.db
      .prepare('UPDATE crew_hails SET acknowledged_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id)
  }

  /** Answers everything one crew is asking, for the "I have seen it" gesture. */
  acknowledgeCrew(crewId: string): number {
    const info = this.db
      .prepare(
        `UPDATE crew_hails SET acknowledged_at = ?
         WHERE crew_id = ? AND acknowledged_at IS NULL`,
      )
      .run(new Date().toISOString(), crewId)
    return info.changes
  }

  private requireById(id: string): CrewHail {
    const row = this.db
      .prepare('SELECT * FROM crew_hails WHERE id = ?')
      .get(id) as CrewHailRow | undefined
    if (!row) throw new Error(`Crew hail not found: ${id}`)
    return crewHailFromRow(row)
  }
}

/**
 * Truncation is the one thing done to a hailed message, and it is done here
 * rather than at the raising site so every reason keeps the same amount.
 */
function truncateHailMessage(message: string | null): string | null {
  if (message === null) return null
  const trimmed = message.trim()
  if (trimmed.length === 0) return null
  return trimmed.length > MAX_CREW_HAIL_MESSAGE_LENGTH
    ? `${trimmed.slice(0, MAX_CREW_HAIL_MESSAGE_LENGTH - 1)}…`
    : trimmed
}
