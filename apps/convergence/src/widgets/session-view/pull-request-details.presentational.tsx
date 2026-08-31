import type { FC } from 'react'
import { ExternalLink } from 'lucide-react'
import type { WorkspacePullRequest } from '@/entities/pull-request'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface PullRequestDetailsProps {
  pullRequest: WorkspacePullRequest
}

export const PullRequestDetails: FC<PullRequestDetailsProps> = ({
  pullRequest,
}) => {
  const repoLabel =
    pullRequest.repositoryOwner && pullRequest.repositoryName
      ? `${pullRequest.repositoryOwner}/${pullRequest.repositoryName}`
      : 'Unknown repository'
  const externalPullRequestUrl = getSafeHttpUrl(pullRequest.url)

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border/70 bg-card/30 p-3">
        <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
          Status
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs',
              stateClassName(pullRequest.state),
            )}
          >
            {statusLabel(pullRequest)}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {pullRequest.lookupStatus}
          </span>
        </div>
        {pullRequest.error ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {pullRequest.error}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-border/70 bg-card/30 p-3">
        <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
          Repository
        </div>
        <p className="truncate text-sm">{repoLabel}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <div className="uppercase">Head</div>
            <div className="truncate text-foreground">
              {pullRequest.headBranch ?? 'Unknown'}
            </div>
          </div>
          <div>
            <div className="uppercase">Base</div>
            <div className="truncate text-foreground">
              {pullRequest.baseBranch ?? 'Unknown'}
            </div>
          </div>
        </div>
      </section>

      {pullRequest.lookupStatus === 'found' ? (
        <section className="rounded-lg border border-border/70 bg-card/30 p-3">
          <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            Pull request
          </div>
          <p className="text-sm font-medium">
            #{pullRequest.number} {pullRequest.title ?? 'Untitled PR'}
          </p>
          {pullRequest.mergedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Merged {new Date(pullRequest.mergedAt).toLocaleString()}
            </p>
          ) : null}
          {externalPullRequestUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full justify-center gap-2"
              onClick={() => window.open(externalPullRequestUrl, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in browser
            </Button>
          ) : null}
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Last checked {new Date(pullRequest.lastCheckedAt).toLocaleString()}
      </p>
    </div>
  )
}

function getSafeHttpUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function statusLabel(pullRequest: WorkspacePullRequest): string {
  if (pullRequest.lookupStatus === 'not-found') return 'No PR found'
  if (pullRequest.lookupStatus === 'gh-unavailable') return 'gh unavailable'
  if (pullRequest.lookupStatus === 'gh-auth-required') return 'gh auth needed'
  if (pullRequest.lookupStatus === 'unsupported-remote') {
    return 'unsupported remote'
  }
  if (pullRequest.lookupStatus === 'error') return 'unknown'
  if (pullRequest.number) return `#${pullRequest.number} ${pullRequest.state}`
  return pullRequest.state
}

function stateClassName(state: WorkspacePullRequest['state']): string {
  switch (state) {
    case 'open':
      return 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-200'
    case 'draft':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200'
    case 'merged':
      return 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-200'
    case 'closed':
      return 'border-muted-foreground/30 bg-muted text-muted-foreground'
    case 'none':
      return 'border-border bg-background text-muted-foreground'
    default:
      return 'border-warning/30 bg-warning/10 text-warning-foreground'
  }
}
