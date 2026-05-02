import {
  ChevronRight,
  GitBranch,
  PackageCheck,
  ShieldCheck,
  Workflow,
} from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import type { WorkboardActiveRun } from '@/entities/workboard'
import {
  runStatusClassNames,
  runStatusLabels,
  stageRoleLabels,
} from './ralph-task-dashboard.styles'
import { Pill } from './pill.presentational'
import { StageRow } from './stage-row.presentational'

interface ActiveRunCardProps {
  run: WorkboardActiveRun
  selected: boolean
  onSelect: () => void
}

export function ActiveRunCard({ run, selected, onSelect }: ActiveRunCardProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        'h-auto w-full flex-col items-stretch justify-start gap-0 whitespace-normal rounded-md border bg-card/72 p-4 text-left shadow-sm transition-colors hover:border-foreground/20',
        selected ? 'border-foreground/30' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            <Pill className={runStatusClassNames[run.status]}>
              {runStatusLabels[run.status]}
            </Pill>
            <span className="truncate text-[11px] text-muted-foreground">
              {run.projectName}
            </span>
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
            {run.issueIds.length} issue Sandcastle run · {run.workflow}
          </h3>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate">{run.branchName}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <PackageCheck className="h-3 w-3" />
          {run.sandbox}
        </span>
        <span className="flex items-center gap-1.5">
          <Workflow className="h-3 w-3" />
          {stageRoleLabels[run.currentStage]}
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" />
          {run.branchStrategy}
        </span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full',
            run.status === 'blocked' ? 'bg-amber-500' : 'bg-emerald-500',
          )}
          style={{ width: `${run.progressPercent}%` }}
        />
      </div>

      <div className="mt-3 space-y-1.5">
        {run.stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} />
        ))}
      </div>
    </Button>
  )
}
