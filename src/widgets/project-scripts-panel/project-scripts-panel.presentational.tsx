import type { FC } from 'react'
import type {
  ProjectScript,
  ProjectScriptRun,
  ProjectScriptRunOutput,
} from '@/entities/project-script'
import { ProjectScriptIcon } from '@/entities/project-script'
import { Button } from '@/shared/ui/button'
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react'
import { ProjectScriptRunLog } from './project-script-run-log.presentational'
import { ProjectScriptStatusPill } from './project-script-status-pill.presentational'

interface ProjectScriptsPanelProps {
  scripts: ProjectScript[]
  latestRunsByScriptId: Record<string, ProjectScriptRun>
  outputByRunId: Record<string, ProjectScriptRunOutput[]>
  expandedRunIds: Set<string>
  error: string | null
  onAdd: () => void
  onEdit: (script: ProjectScript) => void
  onDelete: (script: ProjectScript) => void
  onRun: (script: ProjectScript) => void
  onStop: (run: ProjectScriptRun) => void
  onToggleRun: (runId: string) => void
}

export const ProjectScriptsPanelPresentational: FC<
  ProjectScriptsPanelProps
> = ({
  scripts,
  latestRunsByScriptId,
  outputByRunId,
  expandedRunIds,
  error,
  onAdd,
  onEdit,
  onDelete,
  onRun,
  onStop,
  onToggleRun,
}) => (
  <section className="flex min-h-0 flex-col border-l border-border bg-background/80">
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
      <div>
        <h2 className="text-sm font-medium">Scripts</h2>
        <p className="text-[11px] text-muted-foreground">
          Project commands run without stdin.
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onAdd}
        title="Add script"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
    {error && (
      <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        {error}
      </div>
    )}
    <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
      {scripts.length === 0 ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onAdd}
          className="flex h-auto w-full flex-col items-start rounded-md border border-dashed border-border px-3 py-3 text-left text-sm"
        >
          <span className="font-medium">Add a script</span>
          <span className="mt-1 text-xs text-muted-foreground">
            Save commands like npm run dev, test, or migrate.
          </span>
        </Button>
      ) : (
        <div className="space-y-2">
          {scripts.map((script) => {
            const run = latestRunsByScriptId[script.id]
            const running =
              run?.status === 'queued' || run?.status === 'running'
            const expanded = run ? expandedRunIds.has(run.id) : false
            return (
              <div
                key={script.id}
                className="rounded-md border border-border bg-card"
              >
                <div className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                        <ProjectScriptIcon
                          icon={script.icon}
                          className="h-3.5 w-3.5"
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {script.name}
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                          {script.command}
                        </div>
                      </div>
                    </div>
                    <ProjectScriptStatusPill run={run} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {running && run ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onStop(run)}
                        >
                          <Square className="h-3 w-3" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onRun(script)}
                        >
                          {run ? (
                            <RotateCcw className="h-3 w-3" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                          {run ? 'Run again' : 'Run'}
                        </Button>
                      )}
                      {run && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onToggleRun(run.id)}
                        >
                          {expanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          Logs
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onEdit(script)}
                        title="Edit script"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onDelete(script)}
                        title="Delete script"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
                {run && expanded && (
                  <ProjectScriptRunLog
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
  </section>
)
