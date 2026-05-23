import type { FC } from 'react'
import type {
  ProjectScript,
  ProjectScriptRun,
  ProjectScriptRunOutput,
} from '@/entities/project-script'
import { ProjectScriptIcon } from '@/entities/project-script'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu'
import { cn } from '@/shared/lib/cn.pure'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  ScrollText,
  Square,
  Trash2,
} from 'lucide-react'
import { ProjectActionRunLog } from './project-action-run-log.presentational'
import { formatProjectActionRunMeta } from './project-actions-menu.pure'
import type { ProjectActionItem } from './project-actions-menu.types'

interface ProjectActionsMenuPresentationalProps {
  projectName: string
  items: ProjectActionItem[]
  mode: 'quick' | 'manage'
  outputByRunId: Record<string, ProjectScriptRunOutput[]>
  expandedRunIds: Set<string>
  error: string | null
  onRun: (item: ProjectActionItem) => void
  onStop: (run: ProjectScriptRun) => void
  onAdd: () => void
  onManage: () => void
  onQuickMode: () => void
  onEdit: (script: ProjectScript) => void
  onDelete: (script: ProjectScript) => void
  onToggleRun: (runId: string) => void
}

export const ProjectActionsMenuPresentational: FC<
  ProjectActionsMenuPresentationalProps
> = ({
  projectName,
  items,
  mode,
  outputByRunId,
  expandedRunIds,
  error,
  onRun,
  onStop,
  onAdd,
  onManage,
  onQuickMode,
  onEdit,
  onDelete,
  onToggleRun,
}) => (
  <DropdownMenuContent
    align="end"
    className={cn('p-1.5', mode === 'manage' ? 'w-[28rem]' : 'w-80')}
  >
    <div className="flex items-center justify-between border-b border-border/70 px-2 py-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        {mode === 'manage' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-1 h-6 w-6"
            onClick={onQuickMode}
            title="Back to project actions"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}
        Project actions
      </span>
      <span className="max-w-32 truncate">{projectName}</span>
    </div>

    {error && (
      <div className="border-b border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
        {error}
      </div>
    )}

    {mode === 'quick' ? (
      <>
        {items.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            No actions yet. Add one for this project.
          </div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.script.id}
              onClick={() => onRun(item)}
              className="grid cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2"
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground',
                  item.running && 'border-emerald-500/40 text-emerald-300',
                )}
              >
                <ProjectScriptIcon
                  icon={item.script.icon}
                  className="h-4 w-4"
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {item.script.name}
                </span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {item.script.command}
                </span>
              </span>
              <span
                className={cn(
                  'text-[11px] text-muted-foreground',
                  item.latestRun?.status === 'failed' && 'text-destructive',
                  item.running && 'text-emerald-300',
                )}
              >
                {formatProjectActionRunMeta(item.latestRun)}
              </span>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            onAdd()
          }}
          className="cursor-pointer gap-2 text-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>
            <span className="block font-medium">Add action</span>
            <span className="block font-mono text-[11px] text-muted-foreground">
              Create a project command
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            onManage()
          }}
          className="cursor-pointer gap-2 text-sm"
        >
          <ScrollText className="h-3.5 w-3.5" />
          <span>
            <span className="block font-medium">Manage actions</span>
            <span className="block font-mono text-[11px] text-muted-foreground">
              Edit actions and inspect run history
            </span>
          </span>
        </DropdownMenuItem>
      </>
    ) : (
      <div className="app-scrollbar max-h-[min(34rem,calc(100vh-7rem))] overflow-y-auto py-1">
        {items.length === 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onAdd}
            className="grid h-auto w-full grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-left"
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
        ) : (
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
      </div>
    )}
  </DropdownMenuContent>
)
