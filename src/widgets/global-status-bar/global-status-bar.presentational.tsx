import type { FC } from 'react'
import type { ProjectActivity } from '@/entities/session'
import type { ProviderInfo, SessionSummary } from '@/entities/session'
import { CheckCircle2, CircleAlert, CircleDot, CircleOff } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { AggregateSummary } from './aggregate-summary.presentational'
import { ProjectSummary } from './project-summary.presentational'
import {
  aggregateChipClass,
  barClass,
  dotClass,
  projectChipAttentionClass,
  projectChipClass,
  recencyBadgeClass,
  zoneClass,
} from './global-status-bar.styles'

interface RecencyBadge {
  session: SessionSummary
  projectName: string
  kind: 'completed' | 'failed'
}

interface GlobalStatusBarProps {
  runningCount: number
  attentionCount: number
  byProject: ProjectActivity[]
  recency: RecencyBadge | null
  providers: ProviderInfo[]
  onSelectProject: (projectId: string) => void
}

export const GlobalStatusBar: FC<GlobalStatusBarProps> = ({
  runningCount,
  attentionCount,
  byProject,
  recency,
  providers,
  onSelectProject,
}) => {
  const isEmpty =
    runningCount === 0 && attentionCount === 0 && byProject.length === 0
  const providerLabel = (providerId: string) => {
    if (providerId === 'shell') return 'Terminal'
    return (
      providers.find((entry) => entry.id === providerId)?.vendorLabel ??
      providerId
    )
  }

  return (
    <div className={barClass} data-testid="global-status-bar">
      {isEmpty ? (
        <div className={zoneClass}>
          <CircleOff className="h-3 w-3" />
          <span>No agents running</span>
        </div>
      ) : (
        <>
          <Tooltip delayDuration={120}>
            <TooltipTrigger asChild>
              <div className={zoneClass} data-testid="global-status-aggregate">
                <div className={aggregateChipClass}>
                  <CircleDot className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    <span className="font-medium text-foreground">
                      {runningCount}
                    </span>{' '}
                    running
                  </span>
                </div>
                <div
                  className={cn(
                    aggregateChipClass,
                    attentionCount > 0 &&
                      'border-warning/40 bg-warning/10 text-warning-foreground',
                  )}
                >
                  <CircleAlert
                    className={cn(
                      'h-3 w-3',
                      attentionCount > 0
                        ? 'text-warning-foreground'
                        : 'text-muted-foreground',
                    )}
                  />
                  <span>
                    <span
                      className={cn(
                        'font-medium',
                        attentionCount > 0
                          ? 'text-warning-foreground'
                          : 'text-foreground',
                      )}
                    >
                      {attentionCount}
                    </span>{' '}
                    need you
                  </span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm">
              <AggregateSummary
                byProject={byProject}
                providerLabel={providerLabel}
              />
            </TooltipContent>
          </Tooltip>

          <div
            className={cn(zoneClass, 'min-w-0 flex-1 overflow-hidden')}
            data-testid="global-status-chips"
          >
            {byProject.map((project) => (
              <Tooltip key={project.projectId} delayDuration={120}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectProject(project.projectId)}
                    className={cn(
                      'h-auto px-1.5 py-0.5 text-[11px] font-medium shadow-none',
                      projectChipClass,
                      project.needsAttention.length > 0 &&
                        projectChipAttentionClass,
                    )}
                    data-testid={`global-status-chip-${project.projectId}`}
                    aria-label={`Switch to project ${project.projectName}`}
                  >
                    <span
                      className={cn(
                        dotClass,
                        project.needsAttention.length > 0
                          ? 'bg-warning'
                          : 'bg-emerald-500 dark:bg-emerald-400',
                      )}
                    />
                    <span className="max-w-32 truncate">
                      {project.projectName}
                    </span>
                    <span className="text-muted-foreground/80">
                      {project.running.length > 0 && (
                        <span>{project.running.length}▸</span>
                      )}
                      {project.needsAttention.length > 0 && (
                        <span className="ml-1 text-warning-foreground">
                          {project.needsAttention.length}!
                        </span>
                      )}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm">
                  <ProjectSummary
                    project={project}
                    providerLabel={providerLabel}
                  />
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </>
      )}

      {recency ? (
        <Tooltip delayDuration={120}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelectProject(recency.session.projectId)}
              className={cn(
                'h-auto px-1.5 py-0.5 text-[11px] font-medium shadow-none',
                recencyBadgeClass,
              )}
              data-testid="global-status-recency"
              aria-label={`Switch to project ${recency.projectName}`}
            >
              {recency.kind === 'completed' ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <CircleAlert className="h-3 w-3 text-rose-600 dark:text-rose-400" />
              )}
              <span className="max-w-28 truncate">{recency.session.name}</span>
              <span className="text-muted-foreground/70">
                · {recency.projectName}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="font-medium text-foreground">
              {recency.session.name}
            </p>
            <p className="text-[11px] opacity-80">
              {recency.kind === 'completed' ? 'Completed' : 'Failed'} ·{' '}
              {providerLabel(recency.session.providerId)}
            </p>
            <p className="text-[11px] opacity-70">{recency.projectName}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className="ml-auto" aria-hidden />
      )}
    </div>
  )
}
