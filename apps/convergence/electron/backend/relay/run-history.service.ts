import type Database from 'better-sqlite3'
import type { CrewHailRow, RelayHopRow } from '../database/database.types'
import { crewHailFromRow } from './crew-hail.types'
import { relayHopFromRow } from './relay.types'
import { assembleRuns } from './run-history.pure'
import type { RelayRunPage } from './run-history.pure'

/** How many runs one page of history carries when the caller says nothing. */
export const DEFAULT_RUN_HISTORY_LIMIT = 20

/** The largest page this will build, whatever a caller asks for. */
export const MAX_RUN_HISTORY_LIMIT = 100

export interface ListRunsOptions {
  limit?: number
  /**
   * The oldest run the caller already holds; the page resumes below it.
   *
   * A run id rather than an offset, for the reason the hop trail's cursor is
   * a hop id: history grows at the head, and paging by offset would repeat a
   * run the moment a wire fires mid-read.
   */
  before?: string | null
}

/** One run's place in the page order: when it began, and its tie-break. */
interface RunCursorRow {
  flowRunId: string
  startedAt: string
  endedAt: string
}

/**
 * The read model behind `relay:listRuns` (R12).
 *
 * Its own class rather than a method on `RelayService` or `CrewHailService`,
 * because it is a READER of both tables and the owner of neither: a run is
 * hops and hails grouped by `flowRunId`, and a station whose baton nothing
 * answered can raise a hail with no hop behind it at all -- so neither table
 * alone can list the runs. Putting the query on either service would give one
 * repository a reason to know the other's schema.
 *
 * It never re-tells the ledger. Every fact it returns is a stored fact;
 * grouping, ordering and the design's vocabulary are the only work done here,
 * and all three live in `run-history.pure.ts` where they can be tested
 * without a database.
 */
export class RunHistoryService {
  constructor(
    private db: Database.Database,
    private now: () => Date = () => new Date(),
  ) {}

  listRuns(crewId: string, options: ListRunsOptions = {}): RelayRunPage {
    const limit = resolveLimit(options.limit)
    const cursor = options.before
      ? this.getRunCursor(crewId, options.before)
      : null

    // The anchor was cleared out from under this read. Answering with the
    // newest page instead would repeat runs the caller is already showing, so
    // the honest answer is "nothing older" and the next full load corrects it
    // -- the rule the hop trail's cursor already follows.
    if (options.before && !cursor) {
      return {
        runs: [],
        unattributedHails: [],
        outcomes: {},
        hasMore: false,
      }
    }

    // One page more than asked for, so `hasMore` is an observation rather
    // than a guess: "there was another row" is the only honest way to know.
    const rows = this.readRunCursors(crewId, cursor, limit + 1)
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const flowRunIds = page.map((row) => row.flowRunId)

    return assembleRuns({
      crewId,
      hops: this.readHops(crewId, flowRunIds),
      // Both kinds of call in one list: which of them belongs to a run is
      // `assembleRuns`'s single decision, not a filter smuggled into SQL
      // where no test can put an orphan in and watch it stay out.
      //
      // The orphans ride the FIRST page only. They belong to no run, so there
      // is no run order to page them by, and repeating them under every page
      // would make one dropped call look like several.
      hails: [
        ...this.readHails(crewId, flowRunIds),
        ...(cursor ? [] : this.readUnattributedHails(crewId)),
      ],
      flowRunIds,
      hasMore,
      // One instant for the whole page: two runs a millisecond either side of
      // the live window would otherwise be judged by two different clocks.
      now: this.now(),
    })
  }

  /**
   * The runs this crew has, newest first.
   *
   * The key set is the UNION of the two tables', not the ledger's alone: a
   * station with no outgoing wire has no hop to attribute a row to, and its
   * unrouted call is exactly the case the hail book exists for. A run that is
   * only a hail must still be a run.
   *
   * Ordered by when the run began, tie-broken by its id. Two runs starting
   * inside the same second in one crew is possible -- two sessions settling
   * together -- and `fired_at` has second resolution, so the id is what makes
   * the order total. It is arbitrary between such a pair and identical on
   * every read, which is what a cursor needs.
   */
  private readRunCursors(
    crewId: string,
    cursor: RunCursorRow | null,
    limit: number,
  ): RunCursorRow[] {
    const where = cursor
      ? `HAVING startedAt < ? OR (startedAt = ? AND flowRunId < ?)`
      : ''
    const params: unknown[] = [crewId, crewId]
    if (cursor) {
      params.push(cursor.startedAt, cursor.startedAt, cursor.flowRunId)
    }
    params.push(limit)

    return this.db
      .prepare(
        `SELECT flow_run_id AS flowRunId,
                MIN(at) AS startedAt,
                MAX(at) AS endedAt
         FROM (
           SELECT flow_run_id, fired_at AS at FROM relay_hops WHERE crew_id = ?
           UNION ALL
           SELECT flow_run_id, raised_at AS at FROM crew_hails
             WHERE crew_id = ? AND flow_run_id IS NOT NULL
         )
         GROUP BY flowRunId
         ${where}
         ORDER BY startedAt DESC, flowRunId DESC
         LIMIT ?`,
      )
      .all(...params) as RunCursorRow[]
  }

  private getRunCursor(crewId: string, flowRunId: string): RunCursorRow | null {
    const row = this.db
      .prepare(
        `SELECT flow_run_id AS flowRunId,
                MIN(at) AS startedAt,
                MAX(at) AS endedAt
         FROM (
           SELECT flow_run_id, fired_at AS at FROM relay_hops
             WHERE crew_id = ? AND flow_run_id = ?
           UNION ALL
           SELECT flow_run_id, raised_at AS at FROM crew_hails
             WHERE crew_id = ? AND flow_run_id = ?
         )
         GROUP BY flowRunId`,
      )
      .get(crewId, flowRunId, crewId, flowRunId) as RunCursorRow | undefined
    return row ?? null
  }

  /** Oldest first: the order the run happened in, and the order laps read in. */
  private readHops(crewId: string, flowRunIds: readonly string[]) {
    if (flowRunIds.length === 0) return []
    const rows = this.db
      .prepare(
        `SELECT * FROM relay_hops
         WHERE crew_id = ? AND flow_run_id IN (${placeholders(flowRunIds.length)})
         ORDER BY fired_at ASC, rowid ASC`,
      )
      .all(crewId, ...flowRunIds) as RelayHopRow[]
    return rows.map(relayHopFromRow)
  }

  private readHails(crewId: string, flowRunIds: readonly string[]) {
    if (flowRunIds.length === 0) return []
    const rows = this.db
      .prepare(
        `SELECT * FROM crew_hails
         WHERE crew_id = ? AND flow_run_id IN (${placeholders(flowRunIds.length)})
         ORDER BY raised_at ASC, rowid ASC`,
      )
      .all(crewId, ...flowRunIds) as CrewHailRow[]
    return rows.map(crewHailFromRow)
  }

  private readUnattributedHails(crewId: string) {
    const rows = this.db
      .prepare(
        `SELECT * FROM crew_hails
         WHERE crew_id = ? AND flow_run_id IS NULL
         ORDER BY raised_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(crewId, MAX_RUN_HISTORY_LIMIT) as CrewHailRow[]
    return rows.map(crewHailFromRow)
  }
}

/**
 * A page size that could not have been meant falls back to the default rather
 * than to "everything" -- the rule every other stored knob in this
 * neighbourhood follows, for the same reason.
 */
function resolveLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
    return DEFAULT_RUN_HISTORY_LIMIT
  }
  return Math.min(limit, MAX_RUN_HISTORY_LIMIT)
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ')
}
