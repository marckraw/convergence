import type { CrewHailRow } from '../database/database.types'

/**
 * Why a loop stopped and asked for Marcin.
 *
 * Five ways a crew can need a human, and every one of them is a case that used
 * to be silence. `terminal` is the loop working -- a station said the work is
 * his -- while the other four are the loop failing to reach anybody:
 *
 * - `terminal`: the finishing message declared `BATON: marcin`, the one route
 *   reserved for the chair.
 * - `unrouted`: it declared a baton no enabled wire in this crew answers. A
 *   silent drop is its own defect, so this is loud rather than nothing.
 * - `loop-closed`: it handed a baton on, but the wire that answers to it
 *   already carried this run's work, so the lap closed under the loop law.
 * - `round-budget`: the loop reached its cap without reaching a terminal.
 * - `stall`: a station took the work and never came back.
 */
export type CrewHailReason =
  | 'terminal'
  | 'unrouted'
  | 'loop-closed'
  | 'round-budget'
  | 'stall'

/** One call for Marcin, raised by the engine and cleared by his hand. */
export interface CrewHail {
  id: string
  crewId: string
  /** Null for a hail no flow run produced. */
  flowRunId: string | null
  /**
   * Deliberately wider than `CrewHailReason`, the same split the ledger's
   * outcomes use: that union is the vocabulary this build may WRITE, while a
   * stored row may carry a word an older or newer Convergence wrote. Reads
   * degrade to a neutral label rather than rendering blank.
   */
  reason: string
  /** The station the hail is about. */
  sessionId: string
  /** The baton the message handed on, when it declared one. */
  baton: string | null
  /**
   * The finishing message, attached rather than referenced.
   *
   * A hail that said only "the loop parked" would send Marcin hunting through
   * a transcript for the thing he is being asked about. The message IS the
   * question.
   */
  message: string | null
  /** One sentence saying what happened, in the words he needs. */
  detail: string
  /**
   * The hop the stall clock accused, when the hail is about one -- the
   * debt's identity (MAR-2759). Answering the hail silences THIS hop for
   * good; only a new hop, a new id, re-arms the alarm.
   */
  hopId: string | null
  raisedAt: string
  /** Null while the hail is still asking. */
  acknowledgedAt: string | null
}

export interface RaiseCrewHailInput {
  crewId: string
  flowRunId?: string | null
  reason: CrewHailReason
  sessionId: string
  baton?: string | null
  message?: string | null
  detail: string
  /** The accused hop, for stall hails: the identity the dedupe runs on. */
  hopId?: string | null
}

export function crewHailFromRow(row: CrewHailRow): CrewHail {
  return {
    id: row.id,
    crewId: row.crew_id,
    flowRunId: row.flow_run_id,
    reason: row.reason,
    sessionId: row.session_id,
    baton: row.baton,
    message: row.message,
    detail: row.detail,
    hopId: row.hop_id ?? null,
    raisedAt: row.raised_at,
    acknowledgedAt: row.acknowledged_at,
  }
}
