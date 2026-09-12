import type { FC, ReactNode } from 'react'
import { GitBranch, GitPullRequest, RefreshCw, X } from 'lucide-react'
import type { SessionPullRequest } from '@/shared/types/session-pull-request.types'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface PullRequestPanelProps {
  pullRequest: SessionPullRequest | null
  branchName: string | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onClose: () => void
}

export const PullRequestPanel: FC<PullRequestPanelProps> = ({
  pullRequest,
  branchName,
  loading,
  error,
  onRefresh,
  onClose,
}) => {
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <GitPullRequest className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">Pull request</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh PR status"
            aria-label="Refresh PR status"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            title="Close pull request panel"
            aria-label="Close pull request panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="app-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!branchName && !error && !loading
          ? renderEmptyState('no branch recorded for this session')
          : null}

        {branchName ? (
          <section className="rounded-lg border border-border/70 bg-card/30 p-3">
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Session branch
            </div>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{branchName ?? 'Unknown branch'}</span>
            </div>
          </section>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {branchName && !pullRequest && !loading && !error
          ? renderEmptyState(
              'No PR status cached yet. Refresh to ask GitHub CLI for the current branch.',
            )
          : null}

        {pullRequest ? (
          <section className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">
              #{pullRequest.number} · {pullRequest.state}
            </p>
            <p className="mt-2 break-all text-muted-foreground">
              {pullRequest.url}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => {
                if (/^https:\/\//.test(pullRequest.url))
                  window.open(pullRequest.url, '_blank')
              }}
            >
              Open in browser
            </Button>
          </section>
        ) : null}
      </div>
    </aside>
  )
}

function renderEmptyState(message: string): ReactNode {
  return (
    <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
