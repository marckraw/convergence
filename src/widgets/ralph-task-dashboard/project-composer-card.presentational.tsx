import { AlertTriangle, Check, Play } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import type {
  WorkboardIssueCandidate,
  WorkboardProjectGroup,
} from '@/entities/workboard'
import {
  priorityClassNames,
  sandcastleStatusClassNames,
  sandcastleStatusLabels,
} from './ralph-task-dashboard.styles'
import { Pill } from './pill.presentational'

const CHECK_ICON_CLASS = {
  pass: 'text-emerald-500',
  warn: 'text-amber-500',
  fail: 'text-destructive',
} as const

interface ProjectComposerCardProps {
  group: WorkboardProjectGroup
  issues: WorkboardIssueCandidate[]
  disabled?: boolean
  onStart: (projectId: string, issueIds: string[]) => void
}

export function ProjectComposerCard({
  group,
  issues,
  disabled = false,
  onStart,
}: ProjectComposerCardProps) {
  const selectedIssues = issues.filter((issue) =>
    group.selectedIssueIds.includes(issue.id),
  )
  const readyIssues = issues.filter((issue) => issue.state === 'ready')

  return (
    <div className="rounded-md border border-border bg-card/68 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold">
              {group.projectName}
            </h3>
            <Pill
              className={sandcastleStatusClassNames[group.sandcastleStatus]}
            >
              {sandcastleStatusLabels[group.sandcastleStatus]}
            </Pill>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {group.repoPath}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={group.sandcastleStatus === 'ready' ? 'default' : 'outline'}
          disabled={
            disabled ||
            group.sandcastleStatus !== 'ready' ||
            selectedIssues.length !== 1
          }
          onClick={() => onStart(group.projectId, group.selectedIssueIds)}
        >
          <Play className="h-3.5 w-3.5" />
          Start
        </Button>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded border border-border bg-background/52 px-2.5 py-2">
          <p className="text-[11px] text-muted-foreground">Workflow</p>
          <p className="mt-1 truncate font-medium capitalize">
            {group.workflow}
          </p>
        </div>
        <div className="rounded border border-border bg-background/52 px-2.5 py-2">
          <p className="text-[11px] text-muted-foreground">Policy</p>
          <p className="mt-1 truncate font-medium capitalize">{group.policy}</p>
        </div>
        <div className="rounded border border-border bg-background/52 px-2.5 py-2">
          <p className="text-[11px] text-muted-foreground">Ready issues</p>
          <p className="mt-1 font-medium">
            {selectedIssues.length}/{readyIssues.length} selected
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {issues.map((issue) => {
          const selected = group.selectedIssueIds.includes(issue.id)
          return (
            <div
              key={issue.id}
              className={cn(
                'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded border px-2.5 py-2',
                selected
                  ? 'border-emerald-500/40 bg-emerald-500/8'
                  : 'border-border bg-background/48',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border',
                  selected
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-border',
                )}
              >
                {selected ? <Check className="h-3 w-3" /> : null}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">
                  {issue.externalKey} · {issue.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {issue.labels.join(', ')}
                </p>
              </div>
              <span
                className={cn(
                  'text-[11px] font-medium capitalize',
                  priorityClassNames[issue.priority],
                )}
              >
                {issue.priority}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 grid gap-2">
        {group.checks.map((check) => (
          <div
            key={check.id}
            className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground"
          >
            {check.state === 'pass' ? (
              <Check className={cn('h-3.5 w-3.5', CHECK_ICON_CLASS.pass)} />
            ) : (
              <AlertTriangle
                className={cn('h-3.5 w-3.5', CHECK_ICON_CLASS[check.state])}
              />
            )}
            <span className="truncate">{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
