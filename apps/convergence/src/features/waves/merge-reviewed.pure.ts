import type { ReleaseAct, ReleasePlan } from '@/entities/release'

export function canMergeReviewed(
  plan: ReleasePlan | null,
  selected: readonly string[],
  busy: boolean,
): boolean {
  return (
    !!plan &&
    !plan.unavailable &&
    !plan.running &&
    !busy &&
    selected.length > 0 &&
    selected.every((id) =>
      plan.candidates.some(
        (row) => row.issueId === id && row.verdict === 'mergeable',
      ),
    )
  )
}

export function mergeActWords(act: ReleaseAct, running: boolean): string {
  if (!running && (act.outcome === 'pending' || act.outcome === 'running'))
    return 'interrupted — check GitHub'
  return act.error ? `${act.outcome}: ${act.error}` : act.outcome
}
