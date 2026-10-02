import type { FC } from 'react'
import {
  COMPACTING_CONTEXT_LABEL,
  formatActivityLabel,
  formatSessionAttentionLabel,
  isSessionCompacting,
  type ProjectActivity,
} from '@/entities/session'
import { StatusDot } from '@convergence/ui'
import { barTone } from './global-status-bar.styles'

interface ProjectSummaryProps {
  project: ProjectActivity
  providerLabel: (providerId: string) => string
}

export const ProjectSummary: FC<ProjectSummaryProps> = ({
  project,
  providerLabel,
}) => {
  const rows = [...project.needsAttention, ...project.running]
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-2xs font-medium text-ink">{project.projectName}</p>
      {rows.map((session) => {
        // The shared words for the shared state (MAR-3288 R5).
        const activityLabel = isSessionCompacting(session)
          ? COMPACTING_CONTEXT_LABEL
          : formatActivityLabel(session.activity)
        const waiting =
          session.attention === 'needs-approval' ||
          session.attention === 'needs-input'
        const attentionLabel = waiting
          ? formatSessionAttentionLabel(session)
          : null
        return (
          <div
            key={session.id}
            className="flex min-w-0 items-center gap-1.5 text-2xs"
          >
            <StatusDot
              size="sm"
              tone={waiting ? barTone.waiting : barTone.running}
            />
            <span className="max-w-40 truncate text-ink">{session.name}</span>
            <span className="shrink-0 text-ink-muted">
              · {providerLabel(session.providerId)}
            </span>
            {attentionLabel || activityLabel ? (
              <span
                className="shrink-0 truncate text-ink-muted"
                data-testid={`global-status-activity-${session.id}`}
              >
                · {attentionLabel ?? activityLabel}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
