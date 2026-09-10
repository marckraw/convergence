import type Database from 'better-sqlite3'
import type { CrewHailRow, RelayHopRow } from '../database/database.types'
import { crewHailFromRow } from './crew-hail.types'
import { relayHopFromRow } from './relay.types'
import { assembleRuns } from './run-history.pure'
import { CREW_LIVE_WINDOW_MS } from './crew-hail.pure'
import { BUDGETED_OUTCOMES } from './relay.pure'
import type { RunHistoryCursor, RelayRunPage } from './run-history.pure'

/** How many runs one page of history carries when the caller says nothing. */
export const DEFAULT_RUN_HISTORY_LIMIT = 20

/** The largest page this will build, whatever a caller asks for. */
export const MAX_RUN_HISTORY_LIMIT = 100

export interface ListRunsOptions {
  limit?: number
  /**
   * The oldest run the caller already holds; the page resumes below it.
   *
   * The full key and asOf keep a continuation on the first page's snapshot.
   * A run id alone would be re-evaluated after activity moved its key.
   */
  before?: RunHistoryCursor | null
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
    const cursor = options.before ?? null
    const asOf = cursor?.asOf ?? this.now().toISOString()
    const rows = this.readRunCursors(crewId, cursor, asOf, limit + 1)

    // One page more than asked for, so `hasMore` is an observation rather
    // than a guess: "there was another row" is the only honest way to know.
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const flowRunIds = page.map((row) => row.flowRunId)

    const result = assembleRuns({
      crewId,
      hops: this.readHops(crewId, flowRunIds, asOf),
      // Both kinds of call in one list: which of them belongs to a run is
      // `assembleRuns`'s single decision, not a filter smuggled into SQL
      // where no test can put an orphan in and watch it stay out.
      //
      // The orphans ride the FIRST page only. They belong to no run, so there
      // is no run order to page them by, and repeating them under every page
      // would make one dropped call look like several.
      hails: [
        ...this.readHails(crewId, flowRunIds, asOf),
        ...(cursor ? [] : this.readUnattributedHails(crewId, asOf)),
      ],
      flowRunIds,
      hasMore,
      // One instant for the whole page: two runs a millisecond either side of
      // the live window would otherwise be judged by two different clocks.
      now: new Date(asOf),
    })
    const last = page.at(-1)
    return { ...result, nextCursor: hasMore && last ? { ...last, asOf } : null }
  }

  /**
   * Keyset over the ledger at one instant. Later events and later settle
   * stamps belong to the next refresh, not to this page's order or debt.
   * The same snapshot is passed to the pure read model below.
   */
  private readRunCursors(
    crewId: string,
    cursor: RunHistoryCursor | null,
    asOf: string,
    limit: number,
  ): Omit<RunHistoryCursor, 'asOf'>[] {
    const before = cursor
      ? `WHERE EXISTS (SELECT 1 FROM runs anchor WHERE anchor.flowRunId = @id) AND (live, lastActivityAt, flowRunId) < (@live, @at, @id)`
      : ''
    const budget = BUDGETED_OUTCOMES.map((_, index) => `@budget${index}`).join(
      ', ',
    )
    return this.db
      .prepare(
        `
      WITH hops AS (
        SELECT flow_run_id, strftime('%Y-%m-%dT%H:%M:%fZ', fired_at) AS fired_at,
          CASE WHEN julianday(settled_at) <= julianday(@asOf) THEN strftime('%Y-%m-%dT%H:%M:%fZ', settled_at) ELSE NULL END AS settled_at,
          outcome, dispatch_id
        FROM relay_hops WHERE crew_id = @crew AND julianday(fired_at) <= julianday(@asOf)
      ), events AS (
        SELECT flow_run_id, fired_at AS at,
          CASE WHEN outcome IN (${budget}) AND dispatch_id IS NOT NULL AND settled_at IS NULL AND fired_at >= @floor THEN 1 ELSE 0 END AS live
        FROM hops
        UNION ALL SELECT flow_run_id, settled_at, 0 FROM hops WHERE settled_at IS NOT NULL
        UNION ALL SELECT flow_run_id, strftime('%Y-%m-%dT%H:%M:%fZ', raised_at), 0 FROM crew_hails
          WHERE crew_id = @crew AND flow_run_id IS NOT NULL AND julianday(raised_at) <= julianday(@asOf)
      ), runs AS (
        SELECT flow_run_id AS flowRunId, MAX(at) AS lastActivityAt, MAX(live) AS live
        FROM events GROUP BY flow_run_id
      )
      SELECT * FROM runs ${before}
      ORDER BY live DESC, lastActivityAt DESC, flowRunId DESC LIMIT @limit
    `,
      )
      .all({
        crew: crewId,
        asOf,
        floor: new Date(Date.parse(asOf) - CREW_LIVE_WINDOW_MS).toISOString(),
        limit,
        ...Object.fromEntries(
          BUDGETED_OUTCOMES.map((value, index) => ['budget' + index, value]),
        ),
        ...(cursor
          ? {
              live: cursor.live,
              at: cursor.lastActivityAt,
              id: cursor.flowRunId,
            }
          : {}),
      }) as Omit<RunHistoryCursor, 'asOf'>[]
  }

  /** Oldest first: the order the run happened in, and the order laps read in. */
  private readHops(
    crewId: string,
    flowRunIds: readonly string[],
    asOf: string,
  ) {
    if (flowRunIds.length === 0) return []
    const rows = this.db
      .prepare(
        `SELECT * FROM relay_hops
         WHERE crew_id = ? AND flow_run_id IN (${placeholders(flowRunIds.length)}) AND julianday(fired_at) <= julianday(?)
         ORDER BY fired_at ASC, rowid ASC`,
      )
      .all(crewId, ...flowRunIds, asOf) as RelayHopRow[]
    return rows.map((row) =>
      relayHopFromRow(
        Date.parse(row.settled_at ?? '') > Date.parse(asOf)
          ? { ...row, settled_at: null, settled_status: null }
          : row,
      ),
    )
  }

  private readHails(
    crewId: string,
    flowRunIds: readonly string[],
    asOf: string,
  ) {
    if (flowRunIds.length === 0) return []
    const rows = this.db
      .prepare(
        `SELECT * FROM crew_hails
         WHERE crew_id = ? AND flow_run_id IN (${placeholders(flowRunIds.length)}) AND julianday(raised_at) <= julianday(?)
         ORDER BY raised_at ASC, rowid ASC`,
      )
      .all(crewId, ...flowRunIds, asOf) as CrewHailRow[]
    return rows.map(crewHailFromRow)
  }

  private readUnattributedHails(crewId: string, asOf: string) {
    const rows = this.db
      .prepare(
        `SELECT * FROM crew_hails
         WHERE crew_id = ? AND flow_run_id IS NULL AND julianday(raised_at) <= julianday(?)
         ORDER BY raised_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(crewId, asOf, MAX_RUN_HISTORY_LIMIT) as CrewHailRow[]
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
