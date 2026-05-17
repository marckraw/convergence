import type { FC } from 'react'
import {
  FileCode2,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  Loader2,
} from 'lucide-react'
import {
  getCodeReviewTargetSubtitle,
  getCodeReviewTargetTitle,
  type CodeReviewTarget,
} from '@/entities/code-review'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface CodeReviewTargetRailProps {
  targets: CodeReviewTarget[]
  selectedTargetId: string | null
  loading: boolean
  error: string | null
  onSelectTarget: (target: CodeReviewTarget) => void
}

const sourceIcon = {
  session: FileCode2,
  workspace: GitBranch,
  'project-repository': FolderGit2,
  'pull-request': GitPullRequest,
} satisfies Record<CodeReviewTarget['source'], typeof FileCode2>

export const CodeReviewTargetRail: FC<CodeReviewTargetRailProps> = ({
  targets,
  selectedTargetId,
  loading,
  error,
  onSelectTarget,
}) => (
  <aside className="flex min-h-0 flex-col border-r border-border">
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
      <span className="text-xs font-semibold uppercase text-muted-foreground">
        Review Targets
      </span>
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <span className="text-xs text-muted-foreground">{targets.length}</span>
      )}
    </div>

    <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
      {error ? (
        <p className="px-2 py-3 text-sm text-destructive">{error}</p>
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
