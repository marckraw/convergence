import type { FC } from 'react'
import type {
  ProjectScriptRun,
  ProjectScriptRunOutput,
} from '@/entities/project-script'

interface ProjectActionRunLogProps {
  run: ProjectScriptRun
  liveOutput: ProjectScriptRunOutput[]
}

export const ProjectActionRunLog: FC<ProjectActionRunLogProps> = ({
  run,
  liveOutput,
}) => {
  const chunks =
    liveOutput.length > 0
      ? liveOutput
      : [
          { stream: 'stdout' as const, text: run.stdout },
          { stream: 'stderr' as const, text: run.stderr },
        ].filter((chunk) => chunk.text.length > 0)

  return (
    <div className="border-t border-line bg-surface-muted/30 p-3">
      <div className="mb-2 grid gap-1 text-2xs text-ink-muted">
        <span>cwd: {run.cwd}</span>
        <span>
          started: {formatTimestamp(run.startedAt)}
          {run.endedAt ? ` · ended: ${formatTimestamp(run.endedAt)}` : ''}
          {run.exitCode !== null ? ` · exit: ${run.exitCode}` : ''}
        </span>
        <span>stdin is not supported for project actions.</span>
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border border-line bg-canvas p-2 font-mono text-2xs leading-relaxed">
        {chunks.length === 0 ? (
          <span className="text-ink-muted">No output yet.</span>
        ) : (
          chunks.map((chunk, index) => (
            <span
              key={`${chunk.stream}-${index}`}
              className={chunk.stream === 'stderr' ? 'text-danger-ink' : ''}
            >
              {chunk.text}
            </span>
          ))
        )}
      </pre>
    </div>
  )
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
