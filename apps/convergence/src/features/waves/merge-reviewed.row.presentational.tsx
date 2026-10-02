import type { ReleaseCandidate } from '@/entities/release'
import { Checkbox, ChoiceField } from '@convergence/ui'

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
    <ChoiceField
      className="min-h-10 rounded-lg bg-fill-quiet p-3"
      disabled={running || !mergeable}
      label={
        <span className="block break-words">
          <span className="sr-only">Select PR</span> #{row.prNumber} ·{' '}
          {row.title}
        </span>
      }
      hint={
        <span className="block space-y-1">
          {!row.verdict.startsWith('merged ') ? (
            <span className="block font-mono tabular-nums">
              {row.headSha.slice(0, 7) || '—'} · {row.mergeStateStatus} · verify{' '}
              {row.verify}
            </span>
          ) : null}
          <span className="block text-ink">{row.verdict}</span>
        </span>
      }
    >
      <Checkbox
        checked={mergeable && selected}
        onCheckedChange={() => onToggle(row.issueId)}
      />
    </ChoiceField>
  )
}
