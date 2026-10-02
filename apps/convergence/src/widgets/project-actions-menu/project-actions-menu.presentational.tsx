import type { FC, ReactNode } from 'react'
import type {
  ProjectScript,
  ProjectScriptRun,
  ProjectScriptRunOutput,
} from '@/entities/project-script'
import { ProjectScriptIcon } from '@/entities/project-script'
import {
  Button,
  cn,
  IconButton,
  Notice,
  PopoverContent,
  SectionLabel,
  Tooltip,
  type PopupFinalFocus,
  type PopupOpenChangeDetails,
} from '@convergence/ui'
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  GitFork,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react'
import { ProjectActionRunLog } from './project-action-run-log.presentational'
import { formatProjectActionRunMeta } from './project-actions-menu.pure'
import {
  actionButtonRow,
  actionDetail,
  actionIconBox,
  actionIconColumn,
  actionRow,
} from './project-actions-menu.styles'
import type { ProjectActionItem } from './project-actions-menu.types'

/**
 * How the panel hands the focus on when it closes, from a header that may
 * have moved its trigger into More (MAR-3427 A, MAR-3616): `finalFocus` on
 * the content, `onOpenChange` heard from the popover's own.
 */
export interface ProjectActionsMenuContentFocus {
  finalFocus: PopupFinalFocus
  onOpenChange: (open: boolean, details: PopupOpenChangeDetails) => void
}

interface ProjectActionsMenuPresentationalProps {
  projectName: string
  contentFocus?: ProjectActionsMenuContentFocus
  items: ProjectActionItem[]
  outputByRunId: Record<string, ProjectScriptRunOutput[]>
  expandedRunIds: Set<string>
  error: string | null
  /** Whether the project this menu belongs to is itself a lane (MAR-2783). */
  isLane: boolean
  onCreateLane: () => void
  onRevealLane: () => void
  onRun: (item: ProjectActionItem) => void
  onStop: (run: ProjectScriptRun) => void
  onAdd: () => void
  onEdit: (script: ProjectScript) => void
  onDelete: (script: ProjectScript) => void
  onToggleRun: (runId: string) => void
  /** Sections after the lanes, in the same menu (MAR-3429 CH4 R4). */
  children?: ReactNode
}

export const ProjectActionsMenuPresentational: FC<
  ProjectActionsMenuPresentationalProps
> = ({
  projectName,
  contentFocus,
  items,
  outputByRunId,
  expandedRunIds,
  error,
  isLane,
  onCreateLane,
  onRevealLane,
  onRun,
  onStop,
  onAdd,
  onEdit,
  onDelete,
  onToggleRun,
  children,
}) => (
  <PopoverContent
    aria-label="Project actions"
    align="end"
    // As tall as it needs, up to 34rem, and never past the window's edge.
    className="flex max-h-(--available-height) w-md flex-col p-1.5"
    finalFocus={contentFocus?.finalFocus}
  >
    <div className="flex items-center justify-between border-b border-line-soft px-2 py-1.5 text-2xs text-ink-muted">
      <SectionLabel>Project actions</SectionLabel>
      <span className="max-w-32 truncate">{projectName}</span>
    </div>

    {error && (
      <Notice tone="danger" title={error} className="m-1.5 py-1.5 text-xs" />
    )}

    <div className="max-h-136 min-h-0 overflow-y-auto py-1">
      {items.length > 0 && (
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          {items.map((item) => {
            const { latestRun: run, running, script } = item
            const expanded = run ? expandedRunIds.has(run.id) : false
            return (
              <div
                key={script.id}
                className="border-b border-line-soft last:border-b-0"
              >
                <div className={cn(actionRow, 'px-3 py-2.5')}>
                  <span className={actionIconColumn}>
                    {running && run ? (
                      // Running is working: R1's info.
                      <IconButton
                        label={`Stop ${script.name}`}
                        type="button"
                        variant="ghost"
                        onClick={() => onStop(run)}
                        className="rounded-md border border-info-line bg-info-soft text-info-ink hover:bg-info-soft hover:text-info-ink"
                      >
                        <Square className="h-4 w-4" />
                      </IconButton>
                    ) : (
                      <IconButton
                        label={`${run ? 'Run again' : 'Run'} ${script.name}`}
                        type="button"
                        variant="quiet"
                        onClick={() => onRun(item)}
                        className="rounded-md border border-line bg-canvas hover:bg-highlight"
                      >
                        {run ? (
                          <RotateCcw className="h-4 w-4" />
                        ) : (
                          <ProjectScriptIcon
                            icon={script.icon}
                            className="h-4 w-4"
                          />
                        )}
                      </IconButton>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {script.name}
                    </div>
                    <div className={actionDetail}>{script.command}</div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Tooltip
                      label={formatProjectActionRunMeta(run)}
                      when="truncated"
                    >
                      <span
                        className={cn(
                          'w-16 truncate text-right text-2xs text-ink-muted',
                          run?.status === 'failed' && 'text-danger-ink',
                          running && 'text-info-ink',
                        )}
                      >
                        {formatProjectActionRunMeta(run)}
                      </span>
                    </Tooltip>
                    {run && (
                      <IconButton
                        label={expanded ? 'Hide output' : 'Show output'}
                        type="button"
                        variant="ghost"
                        onClick={() => onToggleRun(run.id)}
                        size="sm"
                      >
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </IconButton>
                    )}
                    <IconButton
                      label="Edit action"
                      type="button"
                      variant="ghost"
                      onClick={() => onEdit(script)}
                      size="sm"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="Delete action"
                      type="button"
                      variant="ghost"
                      onClick={() => onDelete(script)}
                      size="sm"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
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
        size="lg"
        className={cn(
          actionButtonRow,
          'border border-dashed border-line py-3',
          items.length > 0 && 'mt-2',
        )}
      >
        <span className={actionIconColumn}>
          <span className={actionIconBox}>
            <Plus className="h-4 w-4" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Add action</span>
          <span className={actionDetail}>Create a project command</span>
        </span>
      </Button>

      <div className="mt-2 border-t border-line-soft pt-2">
        <SectionLabel className="px-2 pb-1">Lanes</SectionLabel>
        <Button
          type="button"
          variant="ghost"
          onClick={onCreateLane}
          size="lg"
          className={actionButtonRow}
        >
          <span className={actionIconColumn}>
            <span className={actionIconBox}>
              <GitFork className="h-4 w-4" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Create lane…</span>
            <span className={actionDetail}>
              {isLane
                ? 'A sibling lane, made from the root project'
                : 'A copy with its own git and sessions'}
            </span>
          </span>
        </Button>
        {isLane ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onRevealLane}
            size="lg"
            className={actionButtonRow}
          >
            <span className={actionIconColumn}>
              <span className={actionIconBox}>
                <FolderOpen className="h-4 w-4" />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                Reveal lane in Finder
              </span>
              <span className={actionDetail}>This project is a lane</span>
            </span>
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  </PopoverContent>
)
