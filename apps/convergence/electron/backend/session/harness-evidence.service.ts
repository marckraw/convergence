import type {
  HarnessEvent,
  HarnessTurn,
} from '../../../src/shared/types/harness-facts.types'
import { readHarnessFactRow } from './harness-fact-row.pure'
import { foldHarnessFacts } from './harness-facts.pure'
import type Database from 'better-sqlite3'
import type { ParallelWorkCounts } from '../../../src/shared/lib/parallel-work.pure'
import type {
  HarnessEvidence,
  SessionAgentRun,
  SessionTask,
} from './harness-evidence.types'
import {
  boundedHarnessPayload,
  foldAgentRuns,
  foldTasks,
} from './harness-evidence.pure'

const linkedTaskIdSql = `COALESCE(
  (SELECT t.task_id FROM session_tasks t WHERE t.session_id=a.session_id AND t.task_type='local_agent' AND t.task_id=a.id),
  (SELECT t.task_id FROM session_tasks t JOIN session_conversation_items spawn ON spawn.session_id=a.session_id AND spawn.id=a.spawned_by_item_id
   WHERE t.session_id=a.session_id AND t.task_type='local_agent' AND t.tool_use_id=spawn.provider_item_id ORDER BY t.rowid DESC LIMIT 1)
)`

export class HarnessEvidenceService {
  private singleCounts: Database.Statement | null = null
  constructor(private readonly db: Database.Database) {}
  countParallelWork(sessionIds: string[]): Map<string, ParallelWorkCounts> {
    const counts = new Map(
      sessionIds.map((id) => [
        id,
        { running: 0, unknown: 0, failed: 0, stopped: 0 },
      ]),
    )
    if (!sessionIds.length) return counts
    const placeholders = sessionIds.map(() => '?').join(',')
    // CC2-4c reuses this derivation: alive is current; only failed/stopped use the answer window.
    // The latest turn's start, carried as a column rather than re-read in the
    // WHERE, so the answer window can name it twice for the cost of once.
    const latestTurnStart = (alias: string) =>
      `(SELECT started_at FROM session_turns turn WHERE turn.session_id=${alias}.session_id ORDER BY turn.sequence DESC LIMIT 1) AS turn_start`
    // The window boundary is a comparison of TIMES, and it used to be a
    // comparison of the strings carrying them: `'…00.000Z' < '…00Z'` lexically,
    // so a failure stamped at exactly the turn's start was counted or dropped by
    // nothing but which writer wrote it and at which precision (MAR-2902).
    // `julianday()` reads both as the same instant.
    //
    // It answers NULL for a value it cannot parse, and this column is not
    // guaranteed to hold a timestamp -- pre-ISO rows and fixtures carry plain
    // labels -- so the original string comparison stays as the fallback for
    // those. The fallback is not a perfect copy of the old behaviour: SQLite
    // reads a bare numeric string as a Julian day number, so `'10'` against
    // `'9'` now answers 1 where the text comparison answered 0. No writer emits
    // such a value; a label like `start` or `zz-after` parses as nothing and
    // falls through to the text comparison unchanged (MAR-2992).
    const window = `COALESCE(turn_start,window_start)`
    const query = `WITH linked AS (
      SELECT a.*, ${linkedTaskIdSql} AS linked_task_id FROM session_agent_runs a WHERE a.session_id IN (${placeholders})
    ) SELECT session_id, status, COUNT(*) AS count FROM (
      SELECT a.session_id, CASE WHEN a.status IN ('running','unknown') AND t.status<>'running' THEN t.status ELSE a.status END AS status, a.started_at AS window_start, ${latestTurnStart('a')}
      FROM linked a LEFT JOIN session_tasks t ON t.session_id=a.session_id AND t.task_id=a.linked_task_id
      UNION ALL
      SELECT t.session_id,t.status,COALESCE(t.started_at,t.observed_at) AS window_start, ${latestTurnStart('t')} FROM session_tasks t WHERE t.session_id IN (${placeholders})
      AND NOT EXISTS (SELECT 1 FROM linked a WHERE a.session_id=t.session_id AND a.linked_task_id=t.task_id)
    ) work WHERE status IN ('running','unknown') OR (status IN ('failed','stopped')
      AND window_start IS NOT NULL
      AND COALESCE(julianday(window_start) >= julianday(${window}), window_start >= ${window}))
      GROUP BY session_id,status`
    const statement =
      sessionIds.length === 1
        ? (this.singleCounts ??= this.db.prepare(query))
        : this.db.prepare(query)
    const rows = statement.all(...sessionIds, ...sessionIds) as {
      session_id: string
      status: keyof ParallelWorkCounts
      count: number
    }[]
    for (const row of rows) counts.get(row.session_id)![row.status] = row.count
    return counts
  }
  apply(
    sessionId: string,
    turnId: string | null,
    fact: HarnessEvidence,
  ): { itemIds: string[] } | null {
    return this.db.transaction(() => {
      if (
        fact.kind === 'harness.unknown' ||
        fact.kind === 'harness.hook' ||
        fact.kind === 'harness.retry' ||
        fact.kind === 'harness.compaction' ||
        fact.kind === 'harness.denial' ||
        fact.kind === 'harness.rateLimit' ||
        fact.kind === 'harness.init'
      ) {
        this.recordHarnessEvent(
          sessionId,
          fact.kind === 'harness.unknown' ? fact.type : fact.kind,
          fact.kind === 'harness.unknown'
            ? fact.subtype
            : 'phase' in fact
              ? fact.phase
              : null,
          fact.kind === 'harness.unknown' ? fact.payload : { ...fact, turnId },
          fact.at,
        )
        return null
      }
      if (fact.kind === 'process.ended')
        this.recordHarnessEvent(
          sessionId,
          fact.kind,
          null,
          { ...fact, turnId },
          fact.at,
        )
      if (fact.kind === 'turn.accounting') {
        if (turnId)
          this.db
            .prepare(
              `UPDATE session_turns SET result_subtype=?,usage_json=?,cost_usd=?,permission_denials_json=?,subagent_stats_json=? WHERE session_id=? AND id=?`,
            )
            .run(
              fact.resultSubtype,
              JSON.stringify(fact.usage) ?? null,
              fact.costUsd,
              JSON.stringify(fact.permissionDenials) ?? null,
              JSON.stringify(fact.subagentStats) ?? null,
              sessionId,
              turnId,
            )
        return null
      }
      if (fact.kind === 'task.changed' || fact.kind === 'process.ended') {
        const previousTasks = this.listTasks(sessionId)
        const tasks = foldTasks(previousTasks, fact, sessionId)
        const upsert = this.db
          .prepare(`INSERT INTO session_tasks(task_id,session_id,tool_use_id,task_type,description,status,started_at,ended_at,output_file,stop_reason,ended_summary,observed_at)
          VALUES (@taskId,@sessionId,@toolUseId,@taskType,@description,@status,@startedAt,@endedAt,@outputFile,@stopReason,@endedSummary,@observedAt)
          ON CONFLICT(session_id,task_id) DO UPDATE SET tool_use_id=excluded.tool_use_id,task_type=excluded.task_type,description=excluded.description,status=excluded.status,started_at=excluded.started_at,ended_at=excluded.ended_at,output_file=excluded.output_file,stop_reason=excluded.stop_reason,ended_summary=excluded.ended_summary`)
        for (const task of tasks)
          if (
            task !==
            previousTasks.find((previous) => previous.taskId === task.taskId)
          )
            upsert.run({
              ...task,
              endedSummary: task.endedSummary ?? null,
              stopReason: task.stopReason ?? null,
            })
        if (fact.kind === 'task.changed') {
          const toolId = fact.patch.toolUseId
          if (!toolId) return null
          const changed = this.db
            .prepare(
              `UPDATE session_conversation_items SET task_id=? WHERE session_id=? AND task_id IS NOT ? AND
            (provider_item_id=? OR (task_id IS NULL AND (agent_run_id=? OR agent_run_id IN
              (SELECT id FROM session_agent_runs WHERE session_id=? AND spawned_by_item_id IN
                (SELECT id FROM session_conversation_items WHERE session_id=? AND provider_item_id=?)))) OR
             json_extract(payload_json,'$.relatedItemId') IN
                (SELECT id FROM session_conversation_items WHERE session_id=? AND provider_item_id=?)) RETURNING id`,
            )
            .all(
              fact.taskId,
              sessionId,
              fact.taskId,
              toolId,
              toolId,
              sessionId,
              sessionId,
              toolId,
              sessionId,
              toolId,
            ) as { id: string }[]
          return changed.length > 0
            ? { itemIds: changed.map((item) => item.id) }
            : null
        }
      }
      const previous = this.listAgentRuns(sessionId)
      const runs = foldAgentRuns(previous, fact, sessionId)
      let renamed: { itemIds: string[] } | null = null
      const upsert = this.db
        .prepare(`INSERT INTO session_agent_runs(id,session_id,spawned_by_item_id,agent_type,description,model,status,depth,started_at,ended_at,transcript_path,is_backgrounded,last_tool_name,usage_json,updated_at,stop_reason,ended_summary)
        VALUES (@id,@sessionId,@spawnedByItemId,@agentType,@description,@model,@status,@depth,@startedAt,@endedAt,@transcriptPath,@isBackgrounded,@lastToolName,@usageJson,@updatedAt,@stopReason,@endedSummary)
        ON CONFLICT(session_id,spawned_by_item_id) DO UPDATE SET id=excluded.id,agent_type=excluded.agent_type,description=excluded.description,model=excluded.model,status=excluded.status,depth=excluded.depth,ended_at=excluded.ended_at,transcript_path=excluded.transcript_path,is_backgrounded=excluded.is_backgrounded,last_tool_name=excluded.last_tool_name,usage_json=excluded.usage_json,updated_at=excluded.updated_at,stop_reason=excluded.stop_reason,ended_summary=excluded.ended_summary`)
      for (const run of runs) {
        const old = previous.find(
          (item) => item.spawnedByItemId === run.spawnedByItemId,
        )
        if (run === old) continue
        upsert.run({
          ...run,
          endedSummary: run.endedSummary ?? null,
          stopReason: run.stopReason ?? null,
          isBackgrounded:
            run.isBackgrounded === null ? null : Number(run.isBackgrounded),
        })
        if (old && old.id !== run.id) {
          const changed = this.db
            .prepare(
              'UPDATE session_conversation_items SET agent_run_id=? WHERE session_id=? AND agent_run_id=? RETURNING id',
            )
            .all(run.id, sessionId, old.id) as { id: string }[]
          if (changed.length > 0)
            renamed = { itemIds: changed.map((item) => item.id) }
        }
      }
      return renamed
    })()
  }
  private recordHarnessEvent(
    sessionId: string,
    type: string,
    subtype: string | null,
    payload: unknown,
    at: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO session_harness_events(session_id,sequence,type,subtype,payload_json,created_at)
      SELECT ?,COALESCE(MAX(sequence),0)+1,?,?,?,? FROM session_harness_events WHERE session_id=?`,
      )
      .run(
        sessionId,
        type,
        subtype,
        boundedHarnessPayload(payload),
        at,
        sessionId,
      )
    this.db
      .prepare(
        `DELETE FROM session_harness_events WHERE session_id=? AND sequence IN
      (SELECT sequence FROM session_harness_events WHERE session_id=? ORDER BY sequence DESC LIMIT -1 OFFSET 5000)`,
      )
      .run(sessionId, sessionId)
  }
  harnessFacts(sessionId: string) {
    const turns = (
      this.db
        .prepare(
          'SELECT id,status,started_at AS startedAt,ended_at AS endedAt,permission_denials_json AS permissionDenials FROM session_turns WHERE session_id=? ORDER BY sequence',
        )
        .all(sessionId) as (Omit<HarnessTurn, 'permissionDenials'> & {
        permissionDenials: string | null
      })[]
    ).map((turn) => ({
      ...turn,
      permissionDenials: turn.permissionDenials
        ? JSON.parse(turn.permissionDenials)
        : null,
    }))
    const rows = this.db
      .prepare(
        'SELECT sequence,type,subtype,payload_json AS payload,created_at AS at FROM session_harness_events WHERE session_id=? ORDER BY sequence',
      )
      .all(sessionId) as {
      sequence: number
      type: string
      subtype: string | null
      payload: string
      at: string
    }[]
    const latestTurns = [...turns].reverse()
    const events: HarnessEvent[] = rows.flatMap((row) => {
      const payload = JSON.parse(row.payload)
      const fact = readHarnessFactRow(row.type, payload, row.at, row.subtype)
      if (!fact) return []
      const turnId =
        typeof payload.turnId === 'string'
          ? payload.turnId
          : (latestTurns.find(
              (turn) => compareInstants(turn.startedAt, row.at) <= 0,
            )?.id ?? null)
      return [{ sequence: row.sequence, turnId, fact }]
    })
    return foldHarnessFacts(events, turns)
  }
  listAgentRuns(sessionId: string): SessionAgentRun[] {
    return this.db
      .prepare(
        `SELECT ${linkedTaskIdSql} AS taskId,id,session_id AS sessionId,spawned_by_item_id AS spawnedByItemId,agent_type AS agentType,description,model,status,depth,started_at AS startedAt,ended_at AS endedAt,transcript_path AS transcriptPath,is_backgrounded AS isBackgrounded,last_tool_name AS lastToolName,usage_json AS usageJson,updated_at AS updatedAt,stop_reason AS stopReason,ended_summary AS endedSummary FROM session_agent_runs a WHERE session_id=? ORDER BY started_at,rowid`,
      )
      .all(sessionId)
      .map((row) => {
        const run = row as Omit<SessionAgentRun, 'isBackgrounded'> & {
          isBackgrounded: number | null
        }
        return {
          ...run,
          endedSummary: run.endedSummary ?? null,
          stopReason: run.stopReason ?? null,
          isBackgrounded:
            run.isBackgrounded === null ? null : Boolean(run.isBackgrounded),
        }
      })
  }
  listTasks(sessionId: string): SessionTask[] {
    return this.db
      .prepare(
        `SELECT task_id AS taskId,session_id AS sessionId,tool_use_id AS toolUseId,task_type AS taskType,description,status,started_at AS startedAt,observed_at AS observedAt,ended_at AS endedAt,output_file AS outputFile,stop_reason AS stopReason,ended_summary AS endedSummary FROM session_tasks WHERE session_id=? ORDER BY started_at,rowid`,
      )
      .all(sessionId) as SessionTask[]
  }
}

/**
 * Two timestamps as instants rather than as the text carrying them (MAR-2992).
 *
 * This is the JS half of the seam `countParallelWork`'s SQL window closed with
 * `julianday()`. Attribution compared stamps with `<=`, so a turn written
 * `'2026-09-09T11:00:00Z'` and an event written `'2026-09-09T11:00:00.000Z'` --
 * the same instant, two spellings -- compared as `'Z' > '.'`, and the event was
 * handed to the previous turn. Which turn an event belongs to is not something
 * a writer's choice of precision gets to decide.
 *
 * Latent as things stand: every writer today stamps with `toISOString()`. The
 * fallback is the one the SQL uses for the same reason -- this column is not
 * guaranteed to hold a timestamp (fixtures and pre-ISO rows carry plain labels
 * like `start`), and a value neither side can read as a time answers exactly as
 * it did before.
 */
function compareInstants(a: string, b: string): number {
  const left = Date.parse(a)
  const right = Date.parse(b)
  if (!Number.isNaN(left) && !Number.isNaN(right)) return left - right
  return a < b ? -1 : a > b ? 1 : 0
}
