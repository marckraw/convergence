import type Database from 'better-sqlite3'
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

export class HarnessEvidenceService {
  constructor(private readonly db: Database.Database) {}
  apply(
    sessionId: string,
    turnId: string | null,
    fact: HarnessEvidence,
  ): { itemIds: string[] } | null {
    return this.db.transaction(() => {
      if (fact.kind === 'harness.unknown') {
        this.db
          .prepare(
            `INSERT INTO session_harness_events(session_id,sequence,type,subtype,payload_json,created_at)
          SELECT ?,COALESCE(MAX(sequence),0)+1,?,?,?,? FROM session_harness_events WHERE session_id=?`,
          )
          .run(
            sessionId,
            fact.type,
            fact.subtype,
            boundedHarnessPayload(fact.payload),
            fact.at,
            sessionId,
          )
        this.db
          .prepare(
            `DELETE FROM session_harness_events WHERE session_id=? AND sequence IN
          (SELECT sequence FROM session_harness_events WHERE session_id=? ORDER BY sequence DESC LIMIT -1 OFFSET 5000)`,
          )
          .run(sessionId, sessionId)
        return null
      }
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
          .prepare(`INSERT INTO session_tasks(task_id,session_id,tool_use_id,task_type,description,status,started_at,ended_at,output_file)
          VALUES (@taskId,@sessionId,@toolUseId,@taskType,@description,@status,@startedAt,@endedAt,@outputFile)
          ON CONFLICT(session_id,task_id) DO UPDATE SET tool_use_id=excluded.tool_use_id,task_type=excluded.task_type,description=excluded.description,status=excluded.status,started_at=excluded.started_at,ended_at=excluded.ended_at,output_file=excluded.output_file`)
        for (const task of tasks)
          if (
            task !==
            previousTasks.find((previous) => previous.taskId === task.taskId)
          )
            upsert.run(task)
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
        .prepare(`INSERT INTO session_agent_runs(id,session_id,spawned_by_item_id,agent_type,description,model,status,depth,started_at,ended_at,transcript_path,is_backgrounded,last_tool_name,usage_json,updated_at)
        VALUES (@id,@sessionId,@spawnedByItemId,@agentType,@description,@model,@status,@depth,@startedAt,@endedAt,@transcriptPath,@isBackgrounded,@lastToolName,@usageJson,@updatedAt)
        ON CONFLICT(session_id,spawned_by_item_id) DO UPDATE SET id=excluded.id,agent_type=excluded.agent_type,description=excluded.description,model=excluded.model,status=excluded.status,depth=excluded.depth,ended_at=excluded.ended_at,transcript_path=excluded.transcript_path,is_backgrounded=excluded.is_backgrounded,last_tool_name=excluded.last_tool_name,usage_json=excluded.usage_json,updated_at=excluded.updated_at`)
      for (const run of runs) {
        const old = previous.find(
          (item) => item.spawnedByItemId === run.spawnedByItemId,
        )
        if (run === old) continue
        upsert.run({
          ...run,
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
  listAgentRuns(sessionId: string): SessionAgentRun[] {
    return this.db
      .prepare(
        `SELECT id,session_id AS sessionId,spawned_by_item_id AS spawnedByItemId,agent_type AS agentType,description,model,status,depth,started_at AS startedAt,ended_at AS endedAt,transcript_path AS transcriptPath,is_backgrounded AS isBackgrounded,last_tool_name AS lastToolName,usage_json AS usageJson,updated_at AS updatedAt FROM session_agent_runs WHERE session_id=? ORDER BY started_at,id`,
      )
      .all(sessionId)
      .map((row) => {
        const run = row as Omit<SessionAgentRun, 'isBackgrounded'> & {
          isBackgrounded: number | null
        }
        return {
          ...run,
          isBackgrounded:
            run.isBackgrounded === null ? null : Boolean(run.isBackgrounded),
        }
      })
  }
  listTasks(sessionId: string): SessionTask[] {
    return this.db
      .prepare(
        `SELECT task_id AS taskId,session_id AS sessionId,tool_use_id AS toolUseId,task_type AS taskType,description,status,started_at AS startedAt,ended_at AS endedAt,output_file AS outputFile FROM session_tasks WHERE session_id=? ORDER BY started_at,task_id`,
      )
      .all(sessionId) as SessionTask[]
  }
}
