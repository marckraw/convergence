import type { FC } from 'react'
import { MetaLine, Timestamp } from '@convergence/ui'
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
        {/* A run's start and end, to the second, as Timestamps (use-timestamp). */}
        <MetaLine wrap>
          <span>
            started: <Timestamp date={run.startedAt} format="clock" seconds />
          </span>
          {run.endedAt ? (
            <span>
              ended: <Timestamp date={run.endedAt} format="clock" seconds />
            </span>
          ) : null}
          {run.exitCode !== null ? `exit: ${run.exitCode}` : null}
        </MetaLine>
        <span>stdin is not supported for project actions.</span>
      </div>
      {/* raw-element: a run's live log, stdout and stderr each in its own ink; CodeBlock takes one string */}
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
