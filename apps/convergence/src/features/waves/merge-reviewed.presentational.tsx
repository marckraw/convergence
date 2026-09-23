import { Input } from '@/shared/ui/input'
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
  const waves = [...new Set(plan?.candidates.map((row) => row.wave) ?? [])]
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
          {waves.map((wave) => (
            <section
              key={wave ?? '__no_wave__'}
              aria-label={wave ?? 'no wave'}
              className="space-y-2"
            >
              <h3 className="text-sm font-medium">{wave ?? 'no wave'}</h3>
              {plan?.candidates
                .filter((row) => row.wave === wave)
                .map((row) => (
                  <label
                    key={row.issueId}
                    className="flex min-h-10 items-start gap-3 rounded-lg bg-foreground/5 p-3 text-sm"
                  >
                    <Input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 p-0"
                      checked={selected.includes(row.issueId)}
                      disabled={running}
                      onChange={() => props.onToggle(row.issueId)}
                      aria-label={`Select PR #${row.prNumber}`}
                    />
                    <span className="min-w-0 space-y-1">
                      <span className="block break-words">
                        #{row.prNumber} · {row.title}
                      </span>
                      <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                        {row.headSha.slice(0, 7) || '—'} ·{' '}
                        {row.mergeStateStatus} · verify {row.verify}
                      </span>
                      <span className="block text-xs">{row.verdict}</span>
                    </span>
                  </label>
                ))}
            </section>
          ))}
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
            Merge {selected.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
