import {
  GitPullRequest,
  GitPullRequestDraft,
  GitMerge,
  GitPullRequestClosed,
  CircleCheck,
  MessageSquareWarning,
} from 'lucide-react'
import type { SessionPullRequest } from '@/shared/types/session-pull-request.types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
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
  const color =
    presentation.state === 'merged'
      ? 'text-purple-600 dark:text-purple-400'
      : presentation.state === 'closed'
        ? 'text-destructive'
        : presentation.state === 'changes-requested'
          ? 'text-warning-foreground'
          : presentation.state === 'draft'
            ? 'text-muted-foreground'
            : 'text-emerald-700 dark:text-emerald-400'
  const content = (
    <>
      <Icon aria-hidden="true" className={`size-3 shrink-0 ${color}`} />
      <span className="tabular-nums">#{pr.number}</span>
      <span className="text-muted-foreground">· {presentation.label}</span>
    </>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {presentation.href ? (
          <a
            className="relative z-10 flex w-fit max-w-full items-center gap-1 rounded py-0.5 text-[10px] font-normal hover:underline focus-visible:outline focus-visible:outline-2"
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
            className="relative z-10 flex items-center gap-1 text-[10px]"
          >
            {content}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-72 whitespace-pre-line">
        {presentation.tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
