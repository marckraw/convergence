import type {
  WorkboardIssuePriority,
  WorkboardIssueState,
  WorkboardMappingStatus,
  WorkboardRunStatus,
  WorkboardSandcastleStatus,
  WorkboardStageRole,
  WorkboardStageStatus,
  WorkboardTrackerStatus,
  WorkboardTrackerType,
} from '@/entities/workboard'

export const trackerTypeLabels: Record<WorkboardTrackerType, string> = {
  linear: 'Linear',
  jira: 'Jira',
}

export const trackerStatusLabels: Record<WorkboardTrackerStatus, string> = {
  connected: 'Connected',
  'needs-auth': 'Needs auth',
  syncing: 'Syncing',
}

export const trackerStatusClassNames: Record<WorkboardTrackerStatus, string> = {
  connected:
    'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'needs-auth':
    'border-amber-400/50 bg-amber-500/12 text-amber-800 dark:text-amber-300',
  syncing: 'border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
}

export const issueStateLabels: Record<WorkboardIssueState, string> = {
  candidate: 'Candidate',
  ready: 'Ready',
  running: 'Running',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
}

export const issueStateClassNames: Record<WorkboardIssueState, string> = {
  candidate: 'border-border bg-muted text-muted-foreground',
  ready:
    'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  running: 'border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  blocked:
    'border-amber-400/50 bg-amber-500/12 text-amber-800 dark:text-amber-300',
  review:
    'border-violet-400/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  done: 'border-zinc-400/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  failed:
    'border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300',
}

export const priorityClassNames: Record<WorkboardIssuePriority, string> = {
  urgent: 'text-destructive',
  high: 'text-amber-700 dark:text-amber-300',
  medium: 'text-sky-700 dark:text-sky-300',
  low: 'text-muted-foreground',
}

export const mappingStatusLabels: Record<WorkboardMappingStatus, string> = {
  mapped: 'Mapped',
  'needs-mapping': 'Needs mapping',
  'project-not-ready': 'Project not ready',
}

export const mappingStatusClassNames: Record<WorkboardMappingStatus, string> = {
  mapped:
    'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'needs-mapping':
    'border-amber-400/50 bg-amber-500/12 text-amber-800 dark:text-amber-300',
  'project-not-ready':
    'border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
}

export const sandcastleStatusLabels: Record<WorkboardSandcastleStatus, string> =
  {
    ready: '.sandcastle ready',
    'missing-sandcastle': 'Needs init',
    'auth-risk': 'Auth mount check',
    'needs-docker': 'Needs Docker',
  }

export const sandcastleStatusClassNames: Record<
  WorkboardSandcastleStatus,
  string
> = {
  ready:
    'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'missing-sandcastle':
    'border-amber-400/50 bg-amber-500/12 text-amber-800 dark:text-amber-300',
  'auth-risk':
    'border-violet-400/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'needs-docker':
    'border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300',
}

export const runStatusLabels: Record<WorkboardRunStatus, string> = {
  queued: 'Queued',
  starting: 'Starting',
  running: 'Running',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
  stopping: 'Stopping',
  stopped: 'Stopped',
}

export const runStatusClassNames: Record<WorkboardRunStatus, string> = {
  queued: 'border-border bg-muted text-muted-foreground',
  starting: 'border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  running:
    'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  blocked:
    'border-amber-400/50 bg-amber-500/12 text-amber-800 dark:text-amber-300',
  review:
    'border-violet-400/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  done: 'border-zinc-400/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  failed:
    'border-destructive/40 bg-destructive/10 text-destructive dark:text-red-300',
  stopping:
    'border-amber-400/50 bg-amber-500/12 text-amber-800 dark:text-amber-300',
  stopped: 'border-zinc-400/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
}

export const stageRoleLabels: Record<WorkboardStageRole, string> = {
  sync: 'Tracker sync',
  planner: 'Planner',
  implementer: 'Implementer',
  reviewer: 'Reviewer',
  writeback: 'Write-back',
  merger: 'Merger',
}

export const stageStatusLabels: Record<WorkboardStageStatus, string> = {
  waiting: 'Waiting',
  running: 'Running',
  blocked: 'Blocked',
  done: 'Done',
  failed: 'Failed',
  stopping: 'Stopping',
  stopped: 'Stopped',
}

export const stageStatusDotClassNames: Record<WorkboardStageStatus, string> = {
  waiting: 'bg-muted-foreground',
  running: 'bg-emerald-500',
  blocked: 'bg-amber-500',
  done: 'bg-zinc-500',
  failed: 'bg-destructive',
  stopping: 'bg-amber-500',
  stopped: 'bg-zinc-500',
}
