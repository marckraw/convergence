import { cn } from '@/shared/lib/cn.pure'
import type { WorkboardStageRun } from '@/entities/workboard'
import {
  stageRoleLabels,
  stageStatusDotClassNames,
  stageStatusLabels,
} from './ralph-task-dashboard.styles'

interface StageRowProps {
  stage: WorkboardStageRun
  expanded?: boolean
}

export function StageRow({ stage, expanded = false }: StageRowProps) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded border border-border/70 bg-background/58 px-2.5 py-2">
      <span
        className={cn(
          'h-2.5 w-2.5 rounded-full',
          stageStatusDotClassNames[stage.status],
        )}
        aria-label={stageStatusLabels[stage.status]}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-xs font-medium">
            {stageRoleLabels[stage.role]}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {stage.provider} · {stage.model}
          </p>
        </div>
        <p
          className={cn(
            'text-[11px] text-muted-foreground',
            expanded ? 'whitespace-pre-wrap break-words' : 'truncate',
          )}
        >
          {stage.logPreview}
        </p>
      </div>
      <div className="text-right text-[11px] text-muted-foreground">
        <p>
          {stage.iteration}/{stage.maxIterations}
        </p>
        <p>{stage.elapsed}</p>
      </div>
    </div>
  )
}
