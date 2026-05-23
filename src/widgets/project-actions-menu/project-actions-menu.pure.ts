import type { ProjectScriptRun } from '@/entities/project-script'

export function isProjectScriptRunActive(
  run: ProjectScriptRun | null,
): boolean {
  return run?.status === 'queued' || run?.status === 'running'
}

export function formatProjectActionRunMeta(
  run: ProjectScriptRun | null,
): string {
  if (!run) return 'idle'
  if (run.status === 'queued') return 'queued'
  if (run.status === 'running') return 'running'
  if (run.status === 'succeeded') return 'succeeded'
  if (run.status === 'failed') return 'failed'
  return 'stopped'
}

export function formatProjectActionTimestamp(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
