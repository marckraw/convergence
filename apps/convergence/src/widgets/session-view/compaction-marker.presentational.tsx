import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { Divider } from '@convergence/ui'
import { compactionLabel } from './harness-facts.pure'

export function CompactionMarker({
  fact,
}: {
  fact: SessionHarnessFacts['compactions'][number]
}) {
  // A boundary across the transcript, named by its words (CONV-13).
  return (
    <Divider
      data-testid="compaction-marker"
      className="my-3"
      label={compactionLabel(fact)}
    />
  )
}
