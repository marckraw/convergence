import type { ReleasePlan } from '@/entities/release'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { canMergeReviewed, mergeActWords } from './merge-reviewed.pure'
import { MergeReviewedRow } from './merge-reviewed.row.presentational'

export interface MergeReviewedViewProps {
  open: boolean
  enabled: boolean
  plan: ReleasePlan | null
  selected: string[]
  busy: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onToggle: (issueId: string) => void
  onRefresh: () => void
  onMerge: () => void
}

export function MergeReviewedView(props: MergeReviewedViewProps) {
  const { plan, selected, busy } = props
  const merged =
    plan?.candidates.filter((row) => row.verdict.startsWith('merged ')) ?? []
  const awaiting =
    plan?.candidates.filter((row) => !row.verdict.startsWith('merged ')) ?? []
  const waves = [...new Set(awaiting.map((row) => row.wave))]
  const mergeableCount =
    plan?.candidates.filter(
      (row) => row.verdict === 'mergeable' && selected.includes(row.issueId),
    ).length ?? 0
  const running = busy || !!plan?.running
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10"
          disabled={!props.enabled}
        >
          Merge reviewed…
        </Button>
      </DialogTrigger>
      <DialogContent onKeyDown={(event) => event.stopPropagation()}>
        <DialogHeader className="p-6 pr-12">
          <DialogTitle>Merge reviewed</DialogTitle>
          <DialogDescription>
            Reviewed PRs in Awaiting QA. Untick rows to choose a partial set.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {props.error ? <p role="alert">{props.error}</p> : null}
          {!plan && !props.error ? <p role="status">Reading PRs…</p> : null}
          {plan?.unavailable ? (
            <p role="status">gh not found — merge by hand</p>
          ) : null}
          {plan && plan.candidates.length === 0 ? (
            <p>No reviewed PRs awaiting merge.</p>
          ) : null}
          {merged.length > 0 && awaiting.length === 0 ? (
            <p>Nothing to merge — every reviewed PR is already merged.</p>
          ) : null}
          {waves.map((wave) => (
            <section
              key={wave ?? '__no_wave__'}
              aria-label={wave ?? 'no wave'}
              className="space-y-2"
            >
              <h3 className="text-sm font-medium">{wave ?? 'no wave'}</h3>
              {awaiting
                .filter((row) => row.wave === wave)
                .map((row) => (
                  <MergeReviewedRow
                    key={row.issueId}
                    row={row}
                    selected={selected.includes(row.issueId)}
                    running={running}
                    onToggle={props.onToggle}
                  />
                ))}
            </section>
          ))}
          {merged.length > 0 ? (
            <details className="space-y-2">
              <summary className="min-h-10 cursor-pointer text-sm font-medium">
                Already merged · {merged.length}
              </summary>
              {merged.map((row) => (
                <MergeReviewedRow
                  key={row.issueId}
                  row={row}
                  selected={false}
                  running={running}
                  onToggle={props.onToggle}
                />
              ))}
            </details>
          ) : null}
          <div role="status" aria-live="polite" className="space-y-1 text-sm">
            {plan?.waitingFor ? (
              <p>#{plan.waitingFor}: waiting for the changesets run…</p>
            ) : running ? (
              <p>Merging reviewed PRs…</p>
            ) : null}
            {plan?.acts.map((act) => (
              <p key={act.id}>
                #{act.prNumber} · {mergeActWords(act, !!plan.running)}
              </p>
            ))}
          </div>
        </DialogBody>
        <DialogFooter className="p-6">
          <Button
            variant="outline"
            className="min-h-10"
            onClick={props.onRefresh}
            disabled={running}
          >
            Refresh
          </Button>
          <Button
            className="min-h-10 tabular-nums"
            disabled={!canMergeReviewed(plan, selected, busy)}
            onClick={props.onMerge}
          >
            {mergeableCount > 0
              ? `Merge ${mergeableCount}`
              : 'Nothing to merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
