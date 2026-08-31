import type { FC } from 'react'
import type {
  ProjectScript,
  ProjectScriptRun,
  ProjectScriptRunOutput,
} from '@/entities/project-script'
import { ProjectScriptIcon } from '@/entities/project-script'
import { Button } from '@/shared/ui/button'
import { DropdownMenuContent } from '@/shared/ui/dropdown-menu'
import { cn } from '@/shared/lib/cn.pure'
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react'
import { ProjectActionRunLog } from './project-action-run-log.presentational'
import { formatProjectActionRunMeta } from './project-actions-menu.pure'
import type { ProjectActionItem } from './project-actions-menu.types'

interface ProjectActionsMenuPresentationalProps {
  projectName: string
  items: ProjectActionItem[]
  outputByRunId: Record<string, ProjectScriptRunOutput[]>
  expandedRunIds: Set<string>
  error: string | null
  onRun: (item: ProjectActionItem) => void
  onStop: (run: ProjectScriptRun) => void
  onAdd: () => void
  onEdit: (script: ProjectScript) => void
  onDelete: (script: ProjectScript) => void
  onToggleRun: (runId: string) => void
}

export const ProjectActionsMenuPresentational: FC<
  ProjectActionsMenuPresentationalProps
> = ({
  projectName,
  items,
  outputByRunId,
  expandedRunIds,
  error,
  onRun,
  onStop,
  onAdd,
  onEdit,
  onDelete,
  onToggleRun,
}) => (
  <DropdownMenuContent align="end" className="w-[28rem] p-1.5">
    <div className="flex items-center justify-between border-b border-border/70 px-2 py-1.5 text-[11px] text-muted-foreground">
      <span>Project actions</span>
      <span className="max-w-32 truncate">{projectName}</span>
    </div>

    {error && (
      <div className="border-b border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
        {error}
      </div>
    )}

    <div className="app-scrollbar max-h-[min(34rem,calc(100vh-7rem))] overflow-y-auto py-1">
      {items.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {items.map((item) => {
            const { latestRun: run, running, script } = item
            const expanded = run ? expandedRunIds.has(run.id) : false
            return (
              <div
                key={script.id}
                className="border-b border-border/70 last:border-b-0"
              >
                <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5">
                  {running && run ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200"
                      onClick={() => onStop(run)}
                      title={`Stop ${script.name}`}
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => onRun(item)}
                      title={`${run ? 'Run again' : 'Run'} ${script.name}`}
                    >
                      {run ? (
                        <RotateCcw className="h-4 w-4" />
                      ) : (
                        <ProjectScriptIcon
                          icon={script.icon}
                          className="h-4 w-4"
                        />
                      )}
                    </Button>
                  )}

                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {script.name}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      {script.command}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        'w-16 truncate text-right text-[11px] text-muted-foreground',
                        run?.status === 'failed' && 'text-destructive',
                        running && 'text-emerald-300',
                      )}
                      title={formatProjectActionRunMeta(run)}
                    >
                      {formatProjectActionRunMeta(run)}
                    </span>
                    {run && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onToggleRun(run.id)}
                        title={expanded ? 'Hide output' : 'Show output'}
                      >
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onEdit(script)}
                      title="Edit action"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onDelete(script)}
                      title="Delete action"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {run && expanded && (
                  <ProjectActionRunLog
                    run={run}
                    liveOutput={outputByRunId[run.id] ?? []}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={onAdd}
        className={cn(
          'grid h-auto w-full grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-left',
          items.length > 0 && 'mt-2',
        )}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
          <Plus className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Add action</span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground">
            Create a project command
          </span>
        </span>
      </Button>
    </div>
  </DropdownMenuContent>
)
