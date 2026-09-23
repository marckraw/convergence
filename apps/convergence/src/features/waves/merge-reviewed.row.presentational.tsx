import type { ReleaseCandidate } from '@/entities/release'
import { Input } from '@/shared/ui/input'

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
    <label className="flex min-h-10 items-start gap-3 rounded-lg bg-foreground/5 p-3 text-sm">
      <Input
        type="checkbox"
        className="mt-1 size-4 shrink-0 p-0"
        checked={mergeable && selected}
        disabled={running || !mergeable}
        onChange={() => onToggle(row.issueId)}
        aria-label={`Select PR #${row.prNumber}`}
      />
      <span className="min-w-0 space-y-1">
        <span className="block break-words">
          #{row.prNumber} · {row.title}
        </span>
        {!row.verdict.startsWith('merged ') ? (
          <span className="block font-mono text-xs tabular-nums text-muted-foreground">
            {row.headSha.slice(0, 7) || '—'} · {row.mergeStateStatus} · verify{' '}
            {row.verify}
          </span>
        ) : null}
        <span className="block text-xs">{row.verdict}</span>
      </span>
    </label>
  )
}
