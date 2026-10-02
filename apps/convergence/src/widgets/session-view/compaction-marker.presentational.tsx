import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
import { Divider, MetaLine } from '@convergence/ui'
import { compactionFacts } from './harness-facts.pure'

export function CompactionMarker({
  fact,
}: {
  fact: SessionHarnessFacts['compactions'][number]
}) {
  // A boundary across the transcript, named by its words (CONV-13), its
  // facts on a MetaLine (CONV-23).
  return (
    <Divider
      data-testid="compaction-marker"
      className="my-3"
      label={<MetaLine wrap>{compactionFacts(fact)}</MetaLine>}
    />
  )
}
