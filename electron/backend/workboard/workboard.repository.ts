import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type {
  WorkboardProjectMappingRow,
  WorkboardEventRow,
  WorkboardRunIssueRow,
  WorkboardRunRow,
  WorkboardStageRow,
  WorkboardTrackerIssueRow,
  WorkboardTrackerSourceRow,
} from '../database/database.types'
import type {
  AppendWorkboardEventInput,
  CreateWorkboardRunInput,
  CreateWorkboardStageInput,
  UpsertWorkboardTrackerIssueInput,
  UpsertWorkboardProjectMappingInput,
  UpsertWorkboardTrackerSourceInput,
  WorkboardEventRecord,
  WorkboardRunIssueRecord,
  WorkboardRunRecord,
  WorkboardRunStatus,
  WorkboardStageRecord,
  WorkboardStageRole,
  WorkboardStageStatus,
  WorkboardTrackerIssueRecord,
  WorkboardProjectMappingWithProjectRecord,
  WorkboardProjectMappingRecord,
  WorkboardTrackerSourceRecord,
} from './workboard.types'

function parseRecordJson(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {}
}

function parseStringArrayJson(value: string): string[] {
  const parsed = JSON.parse(value) as unknown
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : []
}

function parseUnknownRecordJson(value: string): Record<string, unknown> {
  try {
    return parseRecordJson(value)
  } catch {
    return {}
  }
}

function parseUnknownStringArrayJson(value: string): string[] {
  try {
    return parseStringArrayJson(value)
  } catch {
    return []
  }
}

function trackerSourceFromRow(
  row: WorkboardTrackerSourceRow,
): WorkboardTrackerSourceRecord {
  return {
    id: row.id,
    type: row.type === 'jira' ? 'jira' : 'linear',
    name: row.name,
    enabled: row.enabled === 1,
    auth: parseRecordJson(row.auth_json),
    sync: parseRecordJson(row.sync_json),
    lastSyncAt: row.last_sync_at,
    lastSyncError: row.last_sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function trackerIssueFromRow(
  row: WorkboardTrackerIssueRow,
): WorkboardTrackerIssueRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    externalId: row.external_id,
    externalKey: row.external_key,
    url: row.url,
    title: row.title,
    body: row.body,
    labels: parseStringArrayJson(row.labels_json),
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    updatedAtExternal: row.updated_at_external,
    raw: parseRecordJson(row.raw_json),
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function projectMappingFromRow(
  row: WorkboardProjectMappingRow,
): WorkboardProjectMappingRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    name: row.name,
    enabled: row.enabled === 1,
    priority: row.priority,
    matcher: parseRecordJson(row.matcher_json),
    projectId: row.project_id,
    workflowPolicy: row.workflow_policy,
    sandboxMode: row.sandbox_mode,
    branchPrefix: row.branch_prefix,
    stageDefaults: parseRecordJson(row.stage_defaults_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function projectMappingWithProjectFromRow(
  row: WorkboardProjectMappingRow & {
    project_name: string
    repository_path: string
  },
): WorkboardProjectMappingWithProjectRecord {
  return {
    ...projectMappingFromRow(row),
    projectName: row.project_name,
    repositoryPath: row.repository_path,
  }
}

function runFromRow(
  row: WorkboardRunRow & { project_name: string },
): WorkboardRunRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    status: row.status as WorkboardRunStatus,
    workflowPolicy: row.workflow_policy,
    sandboxMode: row.sandbox_mode,
    branchStrategy: row.branch_strategy,
    branchName: row.branch_name,
    repoPath: row.repo_path,
    logRoot: row.log_root,
    currentStageId: row.current_stage_id,
    progress: parseUnknownRecordJson(row.progress_json),
    error: row.error,
    sandcastleResult: parseUnknownRecordJson(row.sandcastle_result_json),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function runIssueFromRow(row: WorkboardRunIssueRow): WorkboardRunIssueRecord {
  return {
    runId: row.run_id,
    trackerIssueId: row.tracker_issue_id,
    sortOrder: row.sort_order,
    laneStatus: row.lane_status,
    branchName: row.branch_name,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function stageFromRow(row: WorkboardStageRow): WorkboardStageRecord {
  return {
    id: row.id,
    runId: row.run_id,
    role: row.role as WorkboardStageRole,
    status: row.status as WorkboardStageStatus,
    providerId: row.provider_id,
    model: row.model,
    effort: row.effort,
    maxIterations: row.max_iterations,
    iterationCount: row.iteration_count,
    logFilePath: row.log_file_path,
    commitShas: parseUnknownStringArrayJson(row.commit_shas_json),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    error: row.error,
    result: parseUnknownRecordJson(row.result_json),
  }
}

function eventFromRow(row: WorkboardEventRow): WorkboardEventRecord {
  return {
    id: row.id,
    runId: row.run_id,
    stageId: row.stage_id,
    sequence: row.sequence,
    type: row.type,
    message: row.message,
    payload: parseUnknownRecordJson(row.payload_json),
    createdAt: row.created_at,
  }
}

export class WorkboardRepository {
  constructor(private db: Database.Database) {}

  listTrackerSources(): WorkboardTrackerSourceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM workboard_tracker_sources
         ORDER BY enabled DESC, name ASC`,
      )
      .all() as WorkboardTrackerSourceRow[]

    return rows.map(trackerSourceFromRow)
  }

  upsertTrackerSource(
    input: UpsertWorkboardTrackerSourceInput,
  ): WorkboardTrackerSourceRecord {
    const id = input.id ?? randomUUID()

    this.db
      .prepare(
        `INSERT INTO workboard_tracker_sources (
           id, type, name, enabled, auth_json, sync_json
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           name = excluded.name,
           enabled = excluded.enabled,
           auth_json = excluded.auth_json,
           sync_json = excluded.sync_json,
           updated_at = datetime('now')`,
      )
      .run(
        id,
        input.type,
        input.name.trim(),
        input.enabled === false ? 0 : 1,
        JSON.stringify(input.auth ?? {}),
        JSON.stringify(input.sync ?? {}),
      )

    return this.getTrackerSource(id)!
  }

  getTrackerSource(id: string): WorkboardTrackerSourceRecord | null {
    const row = this.db
      .prepare('SELECT * FROM workboard_tracker_sources WHERE id = ?')
      .get(id) as WorkboardTrackerSourceRow | undefined

    return row ? trackerSourceFromRow(row) : null
  }

  setTrackerSourceSyncing(id: string): void {
    this.db
      .prepare(
        `UPDATE workboard_tracker_sources
         SET last_sync_error = NULL, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(id)
  }

  setTrackerSourceSyncResult(id: string, error: string | null): void {
    this.db
      .prepare(
        `UPDATE workboard_tracker_sources
         SET last_sync_at = datetime('now'),
             last_sync_error = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(error, id)
  }

  upsertTrackerIssues(
    sourceId: string,
    issues: UpsertWorkboardTrackerIssueInput[],
  ): WorkboardTrackerIssueRecord[] {
    const upsert = this.db.transaction(
      (items: UpsertWorkboardTrackerIssueInput[]) => {
        for (const item of items) {
          const id = item.externalId
            ? `${sourceId}:${item.externalId}`
            : randomUUID()
          this.db
            .prepare(
              `INSERT INTO workboard_tracker_issues (
                 id,
                 source_id,
                 external_id,
                 external_key,
                 url,
                 title,
                 body,
                 labels_json,
                 status,
                 priority,
                 assignee,
                 updated_at_external,
                 raw_json,
                 last_seen_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(source_id, external_id) DO UPDATE SET
                 external_key = excluded.external_key,
                 url = excluded.url,
                 title = excluded.title,
                 body = excluded.body,
                 labels_json = excluded.labels_json,
                 status = excluded.status,
                 priority = excluded.priority,
                 assignee = excluded.assignee,
                 updated_at_external = excluded.updated_at_external,
                 raw_json = excluded.raw_json,
                 last_seen_at = datetime('now'),
                 updated_at = datetime('now')`,
            )
            .run(
              id,
              sourceId,
              item.externalId,
              item.externalKey,
              item.url,
              item.title,
              item.body ?? '',
              JSON.stringify(item.labels ?? []),
              item.status ?? '',
              item.priority ?? null,
              item.assignee ?? null,
              item.updatedAtExternal ?? null,
              JSON.stringify(item.raw ?? {}),
            )
        }
      },
    )

    upsert(issues)
    return this.listTrackerIssuesBySource(sourceId)
  }

  listTrackerIssuesBySource(sourceId: string): WorkboardTrackerIssueRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM workboard_tracker_issues
         WHERE source_id = ?
         ORDER BY updated_at_external DESC, updated_at DESC`,
      )
      .all(sourceId) as WorkboardTrackerIssueRow[]

    return rows.map(trackerIssueFromRow)
  }

  listTrackerIssues(): WorkboardTrackerIssueRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM workboard_tracker_issues
         ORDER BY updated_at_external DESC, updated_at DESC`,
      )
      .all() as WorkboardTrackerIssueRow[]

    return rows.map(trackerIssueFromRow)
  }

  getTrackerIssue(id: string): WorkboardTrackerIssueRecord | null {
    const row = this.db
      .prepare('SELECT * FROM workboard_tracker_issues WHERE id = ?')
      .get(id) as WorkboardTrackerIssueRow | undefined

    return row ? trackerIssueFromRow(row) : null
  }

  listProjectMappings(): WorkboardProjectMappingRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM workboard_project_mappings
         ORDER BY enabled DESC, priority DESC, name ASC`,
      )
      .all() as WorkboardProjectMappingRow[]

    return rows.map(projectMappingFromRow)
  }

  listProjectMappingsWithProjects(): WorkboardProjectMappingWithProjectRecord[] {
    const rows = this.db
      .prepare(
        `SELECT workboard_project_mappings.*,
                projects.name AS project_name,
                projects.repository_path AS repository_path
         FROM workboard_project_mappings
         INNER JOIN projects ON projects.id = workboard_project_mappings.project_id
         ORDER BY workboard_project_mappings.enabled DESC,
                  workboard_project_mappings.priority DESC,
                  workboard_project_mappings.name ASC`,
      )
      .all() as Array<
      WorkboardProjectMappingRow & {
        project_name: string
        repository_path: string
      }
    >

    return rows.map(projectMappingWithProjectFromRow)
  }

  upsertProjectMapping(
    input: UpsertWorkboardProjectMappingInput,
  ): WorkboardProjectMappingRecord {
    const id = input.id ?? randomUUID()

    this.db
      .prepare(
        `INSERT INTO workboard_project_mappings (
           id,
           source_id,
           name,
           enabled,
           priority,
           matcher_json,
           project_id,
           workflow_policy,
           sandbox_mode,
           branch_prefix,
           stage_defaults_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source_id = excluded.source_id,
           name = excluded.name,
           enabled = excluded.enabled,
           priority = excluded.priority,
           matcher_json = excluded.matcher_json,
           project_id = excluded.project_id,
           workflow_policy = excluded.workflow_policy,
           sandbox_mode = excluded.sandbox_mode,
           branch_prefix = excluded.branch_prefix,
           stage_defaults_json = excluded.stage_defaults_json,
           updated_at = datetime('now')`,
      )
      .run(
        id,
        input.sourceId,
        input.name.trim(),
        input.enabled === false ? 0 : 1,
        input.priority ?? 0,
        JSON.stringify(input.matcher ?? {}),
        input.projectId,
        input.workflowPolicy ?? 'simple-loop',
        input.sandboxMode ?? 'docker',
        input.branchPrefix ?? 'sandcastle',
        JSON.stringify(input.stageDefaults ?? {}),
      )

    return this.getProjectMapping(id)!
  }

  getProjectMapping(id: string): WorkboardProjectMappingRecord | null {
    const row = this.db
      .prepare('SELECT * FROM workboard_project_mappings WHERE id = ?')
      .get(id) as WorkboardProjectMappingRow | undefined

    return row ? projectMappingFromRow(row) : null
  }

  createRun(input: CreateWorkboardRunInput): WorkboardRunRecord {
    const id = input.id ?? randomUUID()
    this.db
      .prepare(
        `INSERT INTO workboard_runs (
           id,
           project_id,
           status,
           workflow_policy,
           sandbox_mode,
           branch_strategy,
           branch_name,
           repo_path,
           log_root,
           progress_json,
           started_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.status,
        input.workflowPolicy,
        input.sandboxMode,
        input.branchStrategy,
        input.branchName,
        input.repoPath,
        input.logRoot,
        JSON.stringify(input.progress ?? {}),
        input.startedAt ?? null,
      )

    return this.getRun(id)!
  }

  getRun(id: string): WorkboardRunRecord | null {
    const row = this.db
      .prepare(
        `SELECT workboard_runs.*, projects.name AS project_name
         FROM workboard_runs
         INNER JOIN projects ON projects.id = workboard_runs.project_id
         WHERE workboard_runs.id = ?`,
      )
      .get(id) as
      | (WorkboardRunRow & {
          project_name: string
        })
      | undefined

    return row ? runFromRow(row) : null
  }

  listRunsForSnapshot(limit = 20): WorkboardRunRecord[] {
    const rows = this.db
      .prepare(
        `SELECT workboard_runs.*, projects.name AS project_name
         FROM workboard_runs
         INNER JOIN projects ON projects.id = workboard_runs.project_id
         ORDER BY workboard_runs.created_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<
      WorkboardRunRow & {
        project_name: string
      }
    >

    return rows.map(runFromRow)
  }

  addRunIssues(
    runId: string,
    issueIds: string[],
    branchName: string,
  ): WorkboardRunIssueRecord[] {
    const insert = this.db.transaction((ids: string[]) => {
      ids.forEach((trackerIssueId, index) => {
        this.db
          .prepare(
            `INSERT INTO workboard_run_issues (
               run_id,
               tracker_issue_id,
               sort_order,
               lane_status,
               branch_name
             ) VALUES (?, ?, ?, 'queued', ?)`,
          )
          .run(runId, trackerIssueId, index, branchName)
      })
    })

    insert(issueIds)
    return this.listRunIssues(runId)
  }

  listRunIssues(runId: string): WorkboardRunIssueRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM workboard_run_issues
         WHERE run_id = ?
         ORDER BY sort_order ASC`,
      )
      .all(runId) as WorkboardRunIssueRow[]

    return rows.map(runIssueFromRow)
  }

  createStage(input: CreateWorkboardStageInput): WorkboardStageRecord {
    const id = input.id ?? randomUUID()
    this.db
      .prepare(
        `INSERT INTO workboard_stages (
           id,
           run_id,
           role,
           status,
           provider_id,
           model,
           effort,
           max_iterations,
           log_file_path,
           started_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId,
        input.role,
        input.status,
        input.providerId,
        input.model ?? null,
        input.effort ?? null,
        input.maxIterations ?? 1,
        input.logFilePath ?? '',
        input.startedAt ?? null,
      )

    this.db
      .prepare(
        `UPDATE workboard_runs
         SET current_stage_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(id, input.runId)

    return this.getStage(id)!
  }

  getStage(id: string): WorkboardStageRecord | null {
    const row = this.db
      .prepare('SELECT * FROM workboard_stages WHERE id = ?')
      .get(id) as WorkboardStageRow | undefined

    return row ? stageFromRow(row) : null
  }

  listRunStages(runId: string): WorkboardStageRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM workboard_stages
         WHERE run_id = ?
         ORDER BY started_at IS NULL ASC, started_at ASC, id ASC`,
      )
      .all(runId) as WorkboardStageRow[]

    return rows.map(stageFromRow)
  }

  updateRun(input: {
    id: string
    status?: WorkboardRunStatus
    progress?: Record<string, unknown>
    error?: string | null
    sandcastleResult?: Record<string, unknown>
    startedAt?: string | null
    endedAt?: string | null
  }): WorkboardRunRecord {
    const existing = this.getRun(input.id)
    if (!existing) throw new Error(`Workboard run not found: ${input.id}`)

    this.db
      .prepare(
        `UPDATE workboard_runs
         SET status = ?,
             progress_json = ?,
             error = ?,
             sandcastle_result_json = ?,
             started_at = ?,
             ended_at = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        input.status ?? existing.status,
        JSON.stringify(input.progress ?? existing.progress),
        input.error === undefined ? existing.error : input.error,
        JSON.stringify(input.sandcastleResult ?? existing.sandcastleResult),
        input.startedAt === undefined ? existing.startedAt : input.startedAt,
        input.endedAt === undefined ? existing.endedAt : input.endedAt,
        input.id,
      )

    return this.getRun(input.id)!
  }

  updateStage(input: {
    id: string
    status?: WorkboardStageStatus
    iterationCount?: number
    commitShas?: string[]
    error?: string | null
    result?: Record<string, unknown>
    startedAt?: string | null
    endedAt?: string | null
  }): WorkboardStageRecord {
    const existing = this.getStage(input.id)
    if (!existing) throw new Error(`Workboard stage not found: ${input.id}`)

    this.db
      .prepare(
        `UPDATE workboard_stages
         SET status = ?,
             iteration_count = ?,
             commit_shas_json = ?,
             error = ?,
             result_json = ?,
             started_at = ?,
             ended_at = ?
         WHERE id = ?`,
      )
      .run(
        input.status ?? existing.status,
        input.iterationCount ?? existing.iterationCount,
        JSON.stringify(input.commitShas ?? existing.commitShas),
        input.error === undefined ? existing.error : input.error,
        JSON.stringify(input.result ?? existing.result),
        input.startedAt === undefined ? existing.startedAt : input.startedAt,
        input.endedAt === undefined ? existing.endedAt : input.endedAt,
        input.id,
      )

    return this.getStage(input.id)!
  }

  appendEvent(input: AppendWorkboardEventInput): WorkboardEventRecord {
    const id = randomUUID()
    const nextSequence =
      ((
        this.db
          .prepare(
            'SELECT MAX(sequence) AS sequence FROM workboard_events WHERE run_id = ?',
          )
          .get(input.runId) as { sequence: number | null } | undefined
      )?.sequence ?? 0) + 1

    this.db
      .prepare(
        `INSERT INTO workboard_events (
           id,
           run_id,
           stage_id,
           sequence,
           type,
           message,
           payload_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId,
        input.stageId ?? null,
        nextSequence,
        input.type,
        input.message,
        JSON.stringify(input.payload ?? {}),
      )

    return this.getEvent(id)!
  }

  getEvent(id: string): WorkboardEventRecord | null {
    const row = this.db
      .prepare('SELECT * FROM workboard_events WHERE id = ?')
      .get(id) as WorkboardEventRow | undefined

    return row ? eventFromRow(row) : null
  }

  listRunEvents(runId: string, limit = 200): WorkboardEventRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM workboard_events
         WHERE run_id = ?
         ORDER BY sequence DESC
         LIMIT ?`,
      )
      .all(runId, limit) as WorkboardEventRow[]

    return rows.reverse().map(eventFromRow)
  }
}
