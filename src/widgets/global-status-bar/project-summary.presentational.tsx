import type { FC } from 'react'
import type { ProjectActivity } from '@/entities/session'
import { formatActivityLabel } from '@/entities/session'
import { cn } from '@/shared/lib/cn.pure'
import { dotClass } from './global-status-bar.styles'

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
      <p className="text-[11px] font-medium text-foreground">
        {project.projectName}
      </p>
      {rows.map((session) => {
        const activityLabel = formatActivityLabel(session.activity)
        return (
          <div
            key={session.id}
            className="flex min-w-0 items-center gap-1.5 text-[11px]"
          >
            <span
              className={cn(
                dotClass,
                session.attention === 'needs-approval' ||
                  session.attention === 'needs-input'
                  ? 'bg-amber-300'
                  : 'bg-emerald-400',
              )}
            />
            <span className="max-w-40 truncate text-foreground">
              {session.name}
            </span>
            <span className="shrink-0 text-muted-foreground/80">
              · {providerLabel(session.providerId)}
            </span>
            {activityLabel ? (
              <span
                className="shrink-0 truncate text-muted-foreground/70"
                data-testid={`global-status-activity-${session.id}`}
              >
                · {activityLabel}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
