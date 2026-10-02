import type { FC } from 'react'
import {
  summarizeAttentionRequests,
  type ProjectActivity,
} from '@/entities/session'

interface AggregateSummaryProps {
  byProject: ProjectActivity[]
  providerLabel: (providerId: string) => string
}

export const AggregateSummary: FC<AggregateSummaryProps> = ({
  byProject,
  providerLabel,
}) => {
  if (byProject.length === 0) {
    return <p className="text-ink-muted">No active projects.</p>
  }
  return (
    <div className="space-y-1.5">
      {byProject.map((project) => (
        <div key={project.projectId} className="min-w-0">
          <p className="truncate text-2xs font-medium text-ink">
            {project.projectName}
          </p>
          <p className="text-2xs text-ink-muted">
            {project.running.length} running ·{' '}
            {project.needsAttention.length > 0
              ? summarizeAttentionRequests(project.needsAttention)
              : '0 need you'}{' '}
            · {project.providerIds.map(providerLabel).join(', ')}
          </p>
        </div>
      ))}
    </div>
  )
}
