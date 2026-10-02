import type { ReleasePlan } from '@/entities/release'
import {
  Button,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  FormError,
} from '@convergence/ui'
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
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            disabled={!props.enabled}
            size="lg"
          >
            Merge reviewed…
          </Button>
        }
      />
      <DialogContent onKeyDown={(event) => event.stopPropagation()}>
        <DialogHeader className="border-b-0 p-6 pr-12">
          <DialogTitle>Merge reviewed</DialogTitle>
          <DialogDescription>
            Reviewed PRs in Awaiting QA. Untick rows to choose a partial set.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <FormError>{props.error}</FormError>
          {/* Loading, unavailable and empty read as every list's do (MC-9). */}
          {!plan && !props.error ? (
            <EmptyState state="loading" size="compact" title="Reading PRs…" />
          ) : null}
          {plan?.unavailable ? (
            <div role="status">
              <EmptyState
                size="compact"
                title="gh not found"
                detail="Merge by hand."
              />
            </div>
          ) : null}
          {plan && plan.candidates.length === 0 ? (
            <EmptyState size="compact" title="No reviewed PRs awaiting merge" />
          ) : null}
          {merged.length > 0 && awaiting.length === 0 ? (
            <EmptyState
              size="compact"
              title="Nothing to merge"
              detail="Every reviewed PR is already merged."
            />
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
            // A Collapsible, its chevron turning (MC-17).
            <Collapsible className="space-y-2">
              <CollapsibleTrigger className="min-h-10 text-sm font-medium">
                Already merged · {merged.length}
              </CollapsibleTrigger>
              <CollapsiblePanel keepMounted className="space-y-2">
                {merged.map((row) => (
                  <MergeReviewedRow
                    key={row.issueId}
                    row={row}
                    selected={false}
                    running={running}
                    onToggle={props.onToggle}
                  />
                ))}
              </CollapsiblePanel>
            </Collapsible>
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
        <DialogFooter className="border-t-0 p-6">
          <Button
            variant="secondary"
            onClick={props.onRefresh}
            disabled={running}
            size="lg"
          >
            Refresh
          </Button>
          <Button
            disabled={!canMergeReviewed(plan, selected, busy)}
            onClick={props.onMerge}
            size="lg"
            className="tabular-nums"
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
