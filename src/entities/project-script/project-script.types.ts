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
