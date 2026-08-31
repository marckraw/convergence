import type { ProjectScript, ProjectScriptRun } from './project-script.types'

export function selectLatestRunsByScriptId(
  runs: ProjectScriptRun[],
): Record<string, ProjectScriptRun> {
  return runs.reduce<Record<string, ProjectScriptRun>>((acc, run) => {
    const existing = acc[run.scriptId]
    if (!existing || existing.startedAt < run.startedAt) {
      acc[run.scriptId] = run
    }
    return acc
  }, {})
}

export function selectActiveRunsByProject(
  runs: ProjectScriptRun[],
  scripts: ProjectScript[],
): Record<string, ProjectScriptRun[]> {
  const knownScriptIds = new Set(scripts.map((script) => script.id))
  return runs.reduce<Record<string, ProjectScriptRun[]>>((acc, run) => {
    if (
      !knownScriptIds.has(run.scriptId) ||
      (run.status !== 'queued' && run.status !== 'running')
    ) {
      return acc
    }
    acc[run.projectId] = [...(acc[run.projectId] ?? []), run]
    return acc
  }, {})
}
