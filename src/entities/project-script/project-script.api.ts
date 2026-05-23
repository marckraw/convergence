import type {
  CreateProjectScriptInput,
  ProjectScript,
  ProjectScriptRun,
  ProjectScriptRunOutput,
  UpdateProjectScriptInput,
} from './project-script.types'

export const projectScriptApi = {
  list: (projectId: string): Promise<ProjectScript[]> =>
    window.electronAPI.projectScripts.list(projectId),

  create: (input: CreateProjectScriptInput): Promise<ProjectScript> =>
    window.electronAPI.projectScripts.create(input),

  update: (
    id: string,
    input: UpdateProjectScriptInput,
  ): Promise<ProjectScript> =>
    window.electronAPI.projectScripts.update(id, input),

  delete: (id: string): Promise<void> =>
    window.electronAPI.projectScripts.delete(id),

  listRuns: (projectId: string): Promise<ProjectScriptRun[]> =>
    window.electronAPI.projectScripts.listRuns(projectId),

  listActiveRuns: (): Promise<ProjectScriptRun[]> =>
    window.electronAPI.projectScripts.listActiveRuns(),

  getRun: (runId: string): Promise<ProjectScriptRun | null> =>
    window.electronAPI.projectScripts.getRun(runId),

  run: (scriptId: string): Promise<ProjectScriptRun> =>
    window.electronAPI.projectScripts.run(scriptId),

  stop: (runId: string): Promise<ProjectScriptRun> =>
    window.electronAPI.projectScripts.stop(runId),

  onRunUpdated: (callback: (run: ProjectScriptRun) => void): (() => void) =>
    window.electronAPI.projectScripts.onRunUpdated(callback),

  onRunOutput: (
    callback: (output: ProjectScriptRunOutput) => void,
  ): (() => void) => window.electronAPI.projectScripts.onRunOutput(callback),
}
