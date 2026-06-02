import type { FC } from 'react'
import {
  FileCode2,
  GitCompareArrows,
  GitPullRequest,
  ListTree,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  getCodeReviewTargetSubtitle,
  getCodeReviewTargetTitle,
  isRemotePullRequestTarget,
  type CodeReviewMode,
  type CodeReviewTarget,
  type CodeReviewView,
} from '@/entities/code-review'
import { Button } from '@/shared/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/tooltip'
import { cn } from '@/shared/lib/cn.pure'
import { ModeButton } from './mode-button.presentational'

interface CodeReviewToolbarProps {
  target: CodeReviewTarget | null
  mode: CodeReviewMode
  view: CodeReviewView
  fileCount: number
  loading: boolean
  statusLabel: string | null
  diffFocusActive: boolean
  canMaterializePullRequest: boolean
  materializingPullRequest: boolean
  canStartWorkspaceSession: boolean
  onModeChange: (mode: CodeReviewMode) => void
  onViewChange: (view: CodeReviewView) => void
  onMaterializePullRequest: () => void
  onStartWorkspaceSession: () => void
  onToggleDiffFocus: () => void
  onRefresh: () => void
  onClose: () => void
}

export const CodeReviewToolbar: FC<CodeReviewToolbarProps> = ({
  target,
  mode,
  view,
  fileCount,
  loading,
  statusLabel,
  diffFocusActive,
  canMaterializePullRequest,
  materializingPullRequest,
  canStartWorkspaceSession,
  onModeChange,
  onViewChange,
  onMaterializePullRequest,
  onStartWorkspaceSession,
  onToggleDiffFocus,
  onRefresh,
  onClose,
}) => {
  const baseBranchDisabled = !target?.sessionId
  const remotePullRequest = target ? isRemotePullRequestTarget(target) : false

  return (
    <div
      className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex min-w-0 items-center gap-2">
        <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {target ? getCodeReviewTargetTitle(target) : 'Code Review'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {target
              ? getCodeReviewTargetSubtitle(target)
              : 'Select a target to review'}
          </p>
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-center rounded-md border border-border bg-card p-0.5">
          <ModeButton
            active={view === 'guide'}
            icon={<ListTree className="h-3.5 w-3.5" />}
            label="Guide"
            onClick={() => onViewChange('guide')}
          />
          <ModeButton
            active={view === 'diff'}
            icon={<GitCompareArrows className="h-3.5 w-3.5" />}
            label="Diff"
            onClick={() => onViewChange('diff')}
          />
        </div>
        <div className="flex items-center rounded-md border border-border bg-card p-0.5">
          <ModeButton
            active={mode === 'working-tree'}
            label={remotePullRequest ? 'Pull Request' : 'Working Tree'}
            onClick={() => onModeChange('working-tree')}
          />
          <ModeButton
            active={mode === 'base-branch'}
            disabled={baseBranchDisabled}
            label="Base Branch"
            onClick={() => onModeChange('base-branch')}
          />
        </div>
        <span className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
          {fileCount} files
        </span>
        {canMaterializePullRequest ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={materializingPullRequest}
            aria-label="Check out PR"
            onClick={onMaterializePullRequest}
          >
            {materializingPullRequest ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitPullRequest className="h-3.5 w-3.5" />
            )}
            Check out PR
          </Button>
        ) : null}
        {canStartWorkspaceSession ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            aria-label="New session"
            onClick={onStartWorkspaceSession}
          >
            <Play className="h-3.5 w-3.5" />
            New session
          </Button>
        ) : null}
        {statusLabel ? (
          <span className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
            {statusLabel}
          </span>
        ) : null}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={diffFocusActive ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                aria-label={
                  diffFocusActive
                    ? 'Exit focused review layout'
                    : 'Focus review content'
                }
                onClick={onToggleDiffFocus}
              >
                {diffFocusActive ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {diffFocusActive
                ? 'Restore side rails'
                : 'Collapse side rails for more review space'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Refresh review data"
                disabled={loading || !target}
                onClick={onRefresh}
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Refresh changed files and visible diffs
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Close code review"
          aria-label="Close code review"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
