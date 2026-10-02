import {
  GitPullRequest,
  GitPullRequestDraft,
  GitMerge,
  GitPullRequestClosed,
  CircleCheck,
  MessageSquareWarning,
} from 'lucide-react'
import type { SessionPullRequest } from '@/shared/types/session-pull-request.types'
import { cn, focusRing, Tooltip } from '@convergence/ui'
import { pullRequestPresentation } from './pull-request-presentation.pure'

export function NeedsYouPr({ pr }: { pr: SessionPullRequest }) {
  const presentation = pullRequestPresentation(pr)
  const Icon =
    presentation.state === 'draft'
      ? GitPullRequestDraft
      : presentation.state === 'merged'
        ? GitMerge
        : presentation.state === 'closed'
          ? GitPullRequestClosed
          : presentation.state === 'changes-requested'
            ? MessageSquareWarning
            : presentation.state === 'approved'
              ? CircleCheck
              : GitPullRequest
  // A merge is the merged hue (teal, as the PR panel draws it, R0); the
  // rest are R1's tones: closed is danger, changes asked a heads-up, open or
  // approved success, a draft muted.
  const color =
    presentation.state === 'merged'
      ? 'text-merged-ink'
      : presentation.state === 'closed'
        ? 'text-danger-ink'
        : presentation.state === 'changes-requested'
          ? 'text-warning-ink'
          : presentation.state === 'draft'
            ? 'text-ink-muted'
            : 'text-success-ink'
  const content = (
    <>
      <Icon aria-hidden="true" className={`size-3 shrink-0 ${color}`} />
      <span className="tabular-nums">#{pr.number}</span>
      <span className="text-ink-muted">· {presentation.label}</span>
    </>
  )
  return (
    <Tooltip label={presentation.tooltip}>
      {presentation.href ? (
        // raw-element: the chip is the card's second door, raised over its stretched first one; TextLink's underline would not fit the chip
        <a
          className={cn(
            'relative z-10 flex w-fit max-w-full items-center gap-1 rounded py-0.5 text-3xs font-normal hover:underline',
            focusRing,
          )}
          href={presentation.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Pull request #${pr.number}, ${presentation.label}`}
        >
          {content}
        </a>
      ) : (
        <span
          tabIndex={0}
          className="relative z-10 flex items-center gap-1 text-3xs"
        >
          {content}
        </span>
      )}
    </Tooltip>
  )
}
