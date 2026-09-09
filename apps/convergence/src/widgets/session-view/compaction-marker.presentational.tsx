import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { compactionLabel } from './harness-facts.pure'

export function CompactionMarker({
  fact,
}: {
  fact: SessionHarnessFacts['compactions'][number]
}) {
  return (
    <div
      role="note"
      data-testid="compaction-marker"
      className="my-3 flex items-center gap-2 text-xs text-muted-foreground"
    >
      <span className="h-px flex-1 bg-border" />
      <span>{compactionLabel(fact)}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
