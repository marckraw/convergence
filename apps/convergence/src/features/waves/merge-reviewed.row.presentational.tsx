import type { ReleaseCandidate } from '@/entities/release'
import { Checkbox } from '@convergence/ui'

export function MergeReviewedRow({
  row,
  selected,
  running,
  onToggle,
}: {
  row: ReleaseCandidate
  selected: boolean
  running: boolean
  onToggle: (issueId: string) => void
}) {
  const mergeable = row.verdict === 'mergeable'
  return (
    <label className="flex min-h-10 items-start gap-3 rounded-lg bg-ink/5 p-3 text-sm">
      <Checkbox
        className="mt-1"
        checked={mergeable && selected}
        disabled={running || !mergeable}
        onCheckedChange={() => onToggle(row.issueId)}
        aria-label={`Select PR #${row.prNumber}`}
      />
      <span className="min-w-0 space-y-1">
        <span className="block break-words">
          #{row.prNumber} · {row.title}
        </span>
        {!row.verdict.startsWith('merged ') ? (
          <span className="block font-mono text-xs tabular-nums text-ink-muted">
            {row.headSha.slice(0, 7) || '—'} · {row.mergeStateStatus} · verify{' '}
            {row.verify}
          </span>
        ) : null}
        <span className="block text-xs">{row.verdict}</span>
      </span>
    </label>
  )
}
