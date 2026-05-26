import type { FC } from 'react'
import { FileCode2, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react'
import {
  getCodeReviewTargetSubtitle,
  getCodeReviewTargetTitle,
  type CodeReviewMode,
  type CodeReviewTarget,
} from '@/entities/code-review'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import { ModeButton } from './mode-button.presentational'

interface CodeReviewToolbarProps {
  target: CodeReviewTarget | null
  mode: CodeReviewMode
  fileCount: number
  loading: boolean
  diffFocusActive: boolean
  onModeChange: (mode: CodeReviewMode) => void
  onToggleDiffFocus: () => void
  onRefresh: () => void
  onClose: () => void
}

export const CodeReviewToolbar: FC<CodeReviewToolbarProps> = ({
  target,
  mode,
  fileCount,
  loading,
  diffFocusActive,
  onModeChange,
  onToggleDiffFocus,
  onRefresh,
  onClose,
}) => {
  const baseBranchDisabled = !target?.sessionId

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
            active={mode === 'working-tree'}
            label="Working Tree"
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
        <Button
          type="button"
          variant={diffFocusActive ? 'secondary' : 'ghost'}
          size="icon"
          className="h-7 w-7"
          title={diffFocusActive ? 'Exit diff focus' : 'Focus diff'}
          aria-label={diffFocusActive ? 'Exit diff focus' : 'Focus diff'}
          onClick={onToggleDiffFocus}
        >
          {diffFocusActive ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Refresh review"
          disabled={loading || !target}
          onClick={onRefresh}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Close code review"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
