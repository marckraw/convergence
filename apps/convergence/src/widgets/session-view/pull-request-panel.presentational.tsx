import type { FC } from 'react'
import { GitBranch, GitPullRequest, RefreshCw, X } from 'lucide-react'
import type { SessionPullRequest } from '@/shared/types/session-pull-request.types'
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Notice,
  PanelHeader,
  SectionLabel,
  SidePanel,
  SidePanelBody,
  Spinner,
} from '@convergence/ui'

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
    <SidePanel>
      <PanelHeader
        title="Pull request"
        icon={<GitPullRequest />}
        actions={
          <>
            <IconButton
              label="Refresh PR status"
              variant="quiet"
              onClick={onRefresh}
              disabled={loading}
              size="sm"
            >
              {loading ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw aria-hidden className="size-3.5" />
              )}
            </IconButton>
            <IconButton
              label="Close pull request panel"
              variant="quiet"
              onClick={onClose}
              size="sm"
            >
              <X aria-hidden className="size-3.5" />
            </IconButton>
          </>
        }
      />

      <SidePanelBody>
        {!branchName && !error && !loading ? (
          <EmptyState title="No branch recorded for this session" />
        ) : null}

        {branchName ? (
          <Card render={<section />}>
            <SectionLabel as="h3" className="mb-2">
              Session branch
            </SectionLabel>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <GitBranch
                aria-hidden
                className="size-4 shrink-0 text-ink-muted"
              />
              <span className="truncate">{branchName}</span>
            </div>
          </Card>
        ) : null}

        {error ? (
          <Notice tone="danger" title="Couldn't check the pull request">
            {error}
          </Notice>
        ) : null}

        {branchName && !pullRequest && !loading && !error ? (
          <EmptyState
            title="No PR status cached yet"
            detail="Refresh to ask GitHub CLI for the current branch."
          />
        ) : null}

        {pullRequest ? (
          <Card render={<section />} className="text-sm">
            <p className="font-medium">
              #{pullRequest.number} · {pullRequest.state}
            </p>
            <p className="mt-2 break-all text-ink-muted">{pullRequest.url}</p>
            <Button
              variant="secondary"
              onClick={() => {
                if (/^https:\/\//.test(pullRequest.url))
                  window.open(pullRequest.url, '_blank')
              }}
              size="lg"
              className="mt-3"
            >
              Open in browser
            </Button>
          </Card>
        ) : null}
      </SidePanelBody>
    </SidePanel>
  )
}
