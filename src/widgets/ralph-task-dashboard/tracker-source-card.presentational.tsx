import type { WorkboardTrackerSource } from '@/entities/workboard'
import {
  trackerStatusClassNames,
  trackerStatusLabels,
  trackerTypeLabels,
} from './ralph-task-dashboard.styles'
import { Pill } from './pill.presentational'

interface TrackerSourceCardProps {
  source: WorkboardTrackerSource
}

export function TrackerSourceCard({ source }: TrackerSourceCardProps) {
  return (
    <div className="rounded-md border border-border bg-card/64 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-xs font-semibold">{source.name}</p>
            <Pill className={trackerStatusClassNames[source.status]}>
              {trackerStatusLabels[source.status]}
            </Pill>
          </div>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {trackerTypeLabels[source.type]} · {source.scope}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {source.candidateCount}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Synced {source.syncedAt}
      </p>
    </div>
  )
}
