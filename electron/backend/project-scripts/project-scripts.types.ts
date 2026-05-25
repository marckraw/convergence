import type {
  ProjectScriptRow,
  ProjectScriptRunRow,
} from '../database/database.types'

export type ProjectScriptRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'stopped'

export type ProjectScriptIconId =
  | 'play'
  | 'check'
  | 'build'
  | 'test'
  | 'wrench'
  | 'bug'

export interface ProjectScript {
  id: string
  projectId: string
  name: string
  command: string
  icon: ProjectScriptIconId
  cwd: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectScriptRun {
  id: string
  scriptId: string
  projectId: string
  command: string
  cwd: string
  status: ProjectScriptRunStatus
  startedAt: string
  endedAt: string | null
  exitCode: number | null
  signal: string | null
  errorMessage: string | null
  stdout: string
  stderr: string
}

export interface ProjectScriptRunOutput {
  runId: string
  stream: 'stdout' | 'stderr'
  text: string
  sequence: number
  emittedAt: string
}

export interface CreateProjectScriptInput {
  projectId: string
  name: string
  command: string
  icon?: ProjectScriptIconId
  cwd?: string | null
}

export interface UpdateProjectScriptInput {
  name?: string
  command?: string
  icon?: ProjectScriptIconId
  cwd?: string | null
}

export interface RunProjectScriptInput {
  cwd?: string | null
}

export interface CreateProjectScriptRunInput {
  scriptId: string
  status?: ProjectScriptRunStatus
  cwd?: string | null
}

export interface FinishProjectScriptRunInput {
  id: string
  status: Extract<ProjectScriptRunStatus, 'succeeded' | 'failed' | 'stopped'>
  exitCode?: number | null
  signal?: string | null
  errorMessage?: string | null
}

export function projectScriptFromRow(row: ProjectScriptRow): ProjectScript {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    command: row.command,
    icon: parseProjectScriptIconId(row.icon),
    cwd: row.cwd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function projectScriptRunFromRow(
  row: ProjectScriptRunRow,
): ProjectScriptRun {
  return {
    id: row.id,
    scriptId: row.script_id,
    projectId: row.project_id,
    command: row.command,
    cwd: row.cwd,
    status: parseProjectScriptRunStatus(row.status),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    exitCode: row.exit_code,
    signal: row.signal,
    errorMessage: row.error_message,
    stdout: row.stdout,
    stderr: row.stderr,
  }
}

export function parseProjectScriptRunStatus(
  value: string,
): ProjectScriptRunStatus {
  if (
    value === 'queued' ||
    value === 'running' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'stopped'
  ) {
    return value
  }

  throw new Error(`Unknown project script run status: ${value}`)
}

export function parseProjectScriptIconId(value: string): ProjectScriptIconId {
  if (
    value === 'play' ||
    value === 'check' ||
    value === 'build' ||
    value === 'test' ||
    value === 'wrench' ||
    value === 'bug'
  ) {
    return value
  }

  return 'play'
}
