import type {
  WorkboardIssuePriority,
  WorkboardIssueState,
} from '../workboard.types'

const STATE_LABELS: Array<{
  label: string
  state: WorkboardIssueState
}> = [
  { label: 'loop-ready', state: 'ready' },
  { label: 'loop-running', state: 'running' },
  { label: 'loop-blocked', state: 'blocked' },
  { label: 'loop-review', state: 'review' },
  { label: 'loop-done', state: 'done' },
  { label: 'loop-failed', state: 'failed' },
  { label: 'loop-candidate', state: 'candidate' },
]

const PRIORITIES: WorkboardIssuePriority[] = ['urgent', 'high', 'medium', 'low']

export function hasWorkboardVisibilityLabel(labels: string[]): boolean {
  return labels.some((label) => label.toLowerCase() === 'convergence-loop')
}

export function deriveIssueStateFromLabels(
  labels: string[],
): WorkboardIssueState {
  const normalized = new Set(labels.map((label) => label.toLowerCase()))
  return (
    STATE_LABELS.find(({ label }) => normalized.has(label))?.state ??
    'candidate'
  )
}

export function normalizeIssuePriority(
  value: string | null | undefined,
): WorkboardIssuePriority {
  const normalized = value?.trim().toLowerCase()
  return PRIORITIES.find((priority) => priority === normalized) ?? 'low'
}
