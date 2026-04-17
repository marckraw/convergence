import type { FC } from 'react'
import type { ProjectActivity } from '@/entities/session'

interface AggregateSummaryProps {
  byProject: ProjectActivity[]
  providerLabel: (providerId: string) => string
}

export const AggregateSummary: FC<AggregateSummaryProps> = ({
  byProject,
  providerLabel,
}) => {
  if (byProject.length === 0) {
    return <p className="text-muted-foreground">No active projects.</p>
  }
  return (
    <div className="space-y-1.5">
      {byProject.map((project) => (
        <div key={project.projectId} className="min-w-0">
          <p className="truncate text-[11px] font-medium text-foreground">
            {project.projectName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {project.running.length} running · {project.needsAttention.length}{' '}
            need you · {project.providerIds.map(providerLabel).join(', ')}
          </p>
        </div>
      ))}
    </div>
  )
}
