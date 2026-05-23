import type { FC } from 'react'
import type { ProjectScriptRun } from '@/entities/project-script'
import { cn } from '@/shared/lib/cn.pure'

interface ProjectScriptStatusPillProps {
  run: ProjectScriptRun | undefined
}

export const ProjectScriptStatusPill: FC<ProjectScriptStatusPillProps> = ({
  run,
}) => {
  if (!run) {
    return (
      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
        idle
      </span>
    )
  }

  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px]',
        run.status === 'failed'
          ? 'border-destructive/40 text-destructive'
          : run.status === 'running' || run.status === 'queued'
            ? 'border-primary/40 text-primary'
            : 'border-border text-muted-foreground',
      )}
    >
      {run.status}
    </span>
  )
}
