import { cn } from '@/shared/lib/cn.pure'
import type { WorkboardIssueCandidate } from '@/entities/workboard'
import {
  issueStateClassNames,
  issueStateLabels,
  mappingStatusClassNames,
  mappingStatusLabels,
  priorityClassNames,
} from './ralph-task-dashboard.styles'
import { Pill } from './pill.presentational'

interface IssueCandidateCardProps {
  issue: WorkboardIssueCandidate
}

export function IssueCandidateCard({ issue }: IssueCandidateCardProps) {
  return (
    <div className="rounded-md border border-border bg-card/64 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex min-w-0 items-center gap-1.5">
            <Pill className={issueStateClassNames[issue.state]}>
              {issueStateLabels[issue.state]}
            </Pill>
            <span className="truncate text-[11px] text-muted-foreground">
              {issue.externalKey}
            </span>
          </div>
          <p className="line-clamp-2 text-xs font-medium leading-snug">
            {issue.title}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 text-[11px] font-medium capitalize',
            priorityClassNames[issue.priority],
          )}
        >
          {issue.priority}
        </span>
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-2">
        <Pill className={mappingStatusClassNames[issue.mappingStatus]}>
          {mappingStatusLabels[issue.mappingStatus]}
        </Pill>
        <span className="truncate text-[11px] text-muted-foreground">
          {issue.projectName ?? 'Unmapped project'}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
        {issue.summary}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{issue.trackerName}</span>
        <span className="shrink-0">{issue.estimate}</span>
      </div>
    </div>
  )
}
