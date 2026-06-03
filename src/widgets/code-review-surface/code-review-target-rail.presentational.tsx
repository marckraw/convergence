import type { FC } from 'react'
import {
  FileCode2,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import {
  getCodeReviewTargetSubtitle,
  getCodeReviewTargetTitle,
  type CodeReviewTarget,
  type CodeReviewTargetFilterSource,
} from '@/entities/code-review'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface CodeReviewTargetRailProps {
  targets: CodeReviewTarget[]
  selectedTargetId: string | null
  loading: boolean
  error: string | null
  collapsed: boolean
  sourceFilters: readonly CodeReviewTargetFilterSource[]
  sourceCounts: Record<CodeReviewTargetFilterSource, number>
  totalTargetCount: number
  onToggleCollapsed: () => void
  onToggleSourceFilter: (source: CodeReviewTargetFilterSource) => void
  onSelectTarget: (target: CodeReviewTarget) => void
}

const sourceIcon = {
  session: FileCode2,
  workspace: GitBranch,
  'project-repository': FolderGit2,
  'pull-request': GitPullRequest,
} satisfies Record<CodeReviewTarget['source'], typeof FileCode2>

const sourceFilterOptions = [
  {
    source: 'session',
    label: 'Sessions',
    shortLabel: 'Session',
    icon: FileCode2,
  },
  {
    source: 'workspace',
    label: 'Workspaces',
    shortLabel: 'Workspace',
    icon: GitBranch,
  },
  {
    source: 'pull-request',
    label: 'Pull Requests',
    shortLabel: 'PR',
    icon: GitPullRequest,
  },
] satisfies Array<{
  source: CodeReviewTargetFilterSource
  label: string
  shortLabel: string
  icon: typeof FileCode2
}>

export const CodeReviewTargetRail: FC<CodeReviewTargetRailProps> = ({
  targets,
  selectedTargetId,
  loading,
  error,
  collapsed,
  sourceFilters,
  sourceCounts,
  totalTargetCount,
  onToggleCollapsed,
  onToggleSourceFilter,
  onSelectTarget,
}) => {
  const selectedTarget = targets.find(
    (target) => target.id === selectedTargetId,
  )
  const CollapsedIcon = selectedTarget
    ? sourceIcon[selectedTarget.source]
    : FileCode2
  const filtered = targets.length !== totalTargetCount
  const countLabel = filtered
    ? `${targets.length}/${totalTargetCount}`
    : String(targets.length)
  const activeFilterCount = sourceFilters.length

  if (collapsed) {
    return (
      <aside className="flex min-h-0 flex-col items-center border-r border-border">
        <div className="flex h-10 w-full shrink-0 items-center justify-center border-b border-border">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Expand review targets"
            aria-label="Expand review targets"
            onClick={onToggleCollapsed}
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 px-1 py-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card"
            title={
              selectedTarget
                ? getCodeReviewTargetTitle(selectedTarget)
                : 'Review targets'
            }
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <CollapsedIcon className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {countLabel}
          </span>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex min-h-0 flex-col border-r border-border">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Review Targets
        </span>
        <div className="flex items-center gap-2">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-xs text-muted-foreground">{countLabel}</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Collapse review targets"
            aria-label="Collapse review targets"
            onClick={onToggleCollapsed}
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 border-b border-border px-2 py-2">
        {sourceFilterOptions.map(
          ({ source, label, shortLabel, icon: Icon }) => {
            const active = sourceFilters.includes(source)
            const onlyActiveFilter = active && activeFilterCount === 1

            return (
              <Button
                key={source}
                type="button"
                variant={active ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 min-w-0 justify-center gap-1 px-1.5 text-[11px]"
                aria-pressed={active}
                aria-label={`Toggle ${label.toLowerCase()} review targets`}
                title={label}
                disabled={onlyActiveFilter}
                onClick={() => onToggleSourceFilter(source)}
              >
                <Icon className="h-3 w-3" />
                <span className="truncate">{shortLabel}</span>
                <span className="text-[10px] text-muted-foreground">
                  {sourceCounts[source]}
                </span>
              </Button>
            )
          },
        )}
      </div>

      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {error ? (
          <p className="px-2 py-3 text-sm text-destructive">{error}</p>
        ) : null}
        {!error && targets.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            No review targets match the selected filters.
          </p>
        ) : null}
        {targets.map((target) => {
          const Icon = sourceIcon[target.source]
          const selected = selectedTargetId === target.id
          return (
            <Button
              key={target.id}
              type="button"
              variant="ghost"
              className={cn(
                'mb-1 flex h-auto min-h-[72px] w-full min-w-0 items-start justify-start gap-2 whitespace-normal rounded-md border px-2.5 py-2.5 text-left transition-colors',
                selected
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-transparent hover:border-border hover:bg-accent',
              )}
              onClick={() => onSelectTarget(target)}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-5 font-medium">
                  {getCodeReviewTargetTitle(target)}
                </span>
                <span className="block truncate text-xs leading-4 text-muted-foreground">
                  {getCodeReviewTargetSubtitle(target)}
                </span>
                <span className="mt-1 flex items-center gap-2 text-[11px] leading-4 text-muted-foreground">
                  <span>{target.status.workingTreeFileCount} changed</span>
                  {target.status.error ? (
                    <span className="truncate text-destructive">
                      {target.status.error}
                    </span>
                  ) : null}
                </span>
              </span>
            </Button>
          )
        })}
      </div>
    </aside>
  )
}
