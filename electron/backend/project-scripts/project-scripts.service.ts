import { randomUUID } from 'crypto'
import { resolve } from 'path'
import type Database from 'better-sqlite3'
import type {
  ProjectRow,
  ProjectScriptRow,
  ProjectScriptRunRow,
} from '../database/database.types'
import {
  projectScriptFromRow,
  projectScriptRunFromRow,
  type CreateProjectScriptInput,
  type CreateProjectScriptRunInput,
  type FinishProjectScriptRunInput,
  type ProjectScriptIconId,
  type ProjectScript,
  type ProjectScriptRun,
  type ProjectScriptRunStatus,
  type UpdateProjectScriptInput,
  parseProjectScriptIconId,
} from './project-scripts.types'

export class ProjectScriptsService {
  constructor(private db: Database.Database) {}

  listByProjectId(projectId: string): ProjectScript[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_scripts
         WHERE project_id = ?
         ORDER BY created_at DESC`,
      )
      .all(projectId) as ProjectScriptRow[]

    return rows.map(projectScriptFromRow)
  }

  create(input: CreateProjectScriptInput): ProjectScript {
    const project = this.getProjectRow(input.projectId)
    if (!project) {
      throw new Error(`Project not found: ${input.projectId}`)
    }

    const id = randomUUID()
    const name = normalizeRequiredText(input.name, 'Script name')
    const command = normalizeRequiredText(input.command, 'Script command')
    const icon = normalizeIcon(input.icon)
    const cwd = normalizeOptionalCwd(input.cwd, project.repository_path)

    this.db
      .prepare(
        `INSERT INTO project_scripts (id, project_id, name, command, icon, cwd)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, project.id, name, command, icon, cwd)

    return projectScriptFromRow(this.getScriptRow(id)!)
  }

  update(id: string, input: UpdateProjectScriptInput): ProjectScript {
    const existing = this.getScriptRow(id)
    if (!existing) {
      throw new Error(`Project script not found: ${id}`)
    }

    const name =
      input.name === undefined
        ? existing.name
        : normalizeRequiredText(input.name, 'Script name')
    const command =
      input.command === undefined
        ? existing.command
        : normalizeRequiredText(input.command, 'Script command')
    const icon =
      input.icon === undefined
        ? parseProjectScriptIconId(existing.icon)
        : normalizeIcon(input.icon)
    const cwd =
      input.cwd === undefined
        ? existing.cwd
        : normalizeOptionalCwd(
            input.cwd,
            this.getProjectRow(existing.project_id)?.repository_path,
          )

    this.db
      .prepare(
        `UPDATE project_scripts
         SET name = ?, command = ?, icon = ?, cwd = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(name, command, icon, cwd, id)

    return projectScriptFromRow(this.getScriptRow(id)!)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM project_scripts WHERE id = ?').run(id)
  }

  listRunsByProjectId(projectId: string): ProjectScriptRun[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_script_runs
         WHERE project_id = ?
         ORDER BY started_at DESC`,
      )
      .all(projectId) as ProjectScriptRunRow[]

    return rows.map(projectScriptRunFromRow)
  }

  listActiveRuns(): ProjectScriptRun[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_script_runs
         WHERE status IN ('queued', 'running')
         ORDER BY started_at DESC`,
      )
      .all() as ProjectScriptRunRow[]

    return rows.map(projectScriptRunFromRow)
  }

  getRun(id: string): ProjectScriptRun | null {
    const row = this.getRunRow(id)
    return row ? projectScriptRunFromRow(row) : null
  }

  createRunRecord(input: CreateProjectScriptRunInput): ProjectScriptRun {
    const script = this.getScriptRow(input.scriptId)
    if (!script) {
      throw new Error(`Project script not found: ${input.scriptId}`)
    }

    const project = this.getProjectRow(script.project_id)
    if (!project) {
      throw new Error(`Project not found: ${script.project_id}`)
    }

    const status = input.status ?? 'queued'
    assertProjectScriptRunStatus(status)
    const id = randomUUID()
    const runtimeCwd = normalizeOptionalCwd(input.cwd, project.repository_path)
    const cwd = script.cwd ?? runtimeCwd ?? project.repository_path

    this.db
      .prepare(
        `INSERT INTO project_script_runs (
           id, script_id, project_id, command, cwd, status
         )
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, script.id, script.project_id, script.command, cwd, status)

    return projectScriptRunFromRow(this.getRunRow(id)!)
  }

  markRunRunning(id: string): ProjectScriptRun {
    const existing = this.getRunRow(id)
    if (!existing) {
      throw new Error(`Project script run not found: ${id}`)
    }

    this.db
      .prepare(
        `UPDATE project_script_runs
         SET status = 'running'
         WHERE id = ?`,
      )
      .run(id)

    return projectScriptRunFromRow(this.getRunRow(id)!)
  }

  appendRunOutput(
    id: string,
    stream: 'stdout' | 'stderr',
    text: string,
  ): ProjectScriptRun {
    const column = stream === 'stdout' ? 'stdout' : 'stderr'
    this.db
      .prepare(
        `UPDATE project_script_runs
         SET ${column} = substr(${column} || ?, -524288)
         WHERE id = ?`,
      )
      .run(text, id)

    const row = this.getRunRow(id)
    if (!row) {
      throw new Error(`Project script run not found: ${id}`)
    }

    return projectScriptRunFromRow(row)
  }

  finishRun(input: FinishProjectScriptRunInput): ProjectScriptRun {
    const existing = this.getRunRow(input.id)
    if (!existing) {
      throw new Error(`Project script run not found: ${input.id}`)
    }

    this.db
      .prepare(
        `UPDATE project_script_runs
         SET status = ?,
             ended_at = COALESCE(ended_at, ?),
             exit_code = ?,
             signal = ?,
             error_message = ?
         WHERE id = ?`,
      )
      .run(
        input.status,
        new Date().toISOString(),
        input.exitCode ?? null,
        input.signal ?? null,
        input.errorMessage ?? null,
        input.id,
      )

    return projectScriptRunFromRow(this.getRunRow(input.id)!)
  }

  private getProjectRow(id: string): ProjectRow | null {
    const row = this.db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(id) as ProjectRow | undefined

    return row ?? null
  }

  private getScriptRow(id: string): ProjectScriptRow | null {
    const row = this.db
      .prepare('SELECT * FROM project_scripts WHERE id = ?')
      .get(id) as ProjectScriptRow | undefined

    return row ?? null
  }

  private getRunRow(id: string): ProjectScriptRunRow | null {
    const row = this.db
      .prepare('SELECT * FROM project_script_runs WHERE id = ?')
      .get(id) as ProjectScriptRunRow | undefined

    return row ?? null
  }
}

function normalizeRequiredText(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${label} is required`)
  }
  return normalized
}

function normalizeIcon(
  value: ProjectScriptIconId | undefined,
): ProjectScriptIconId {
  return value ? parseProjectScriptIconId(value) : 'play'
}

function normalizeOptionalCwd(
  value: string | null | undefined,
  basePath?: string,
): string | null {
  const normalized = value?.trim()
  return normalized ? resolve(basePath ?? process.cwd(), normalized) : null
}

function assertProjectScriptRunStatus(
  value: ProjectScriptRunStatus,
): asserts value is ProjectScriptRunStatus {
  if (
    value !== 'queued' &&
    value !== 'running' &&
    value !== 'succeeded' &&
    value !== 'failed' &&
    value !== 'stopped'
  ) {
    throw new Error(`Invalid project script run status: ${value}`)
  }
}
