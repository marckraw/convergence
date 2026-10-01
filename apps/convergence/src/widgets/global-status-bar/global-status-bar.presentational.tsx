import type { FC, ReactNode } from 'react'
import type { AgentMeterSnapshot } from '@/shared/types/agent-meter.types'
import { AgentMeterSummary } from './agent-meter-summary.presentational'
import type { ProjectActivity } from '@/entities/session'
import { summarizeAttentionRequests } from '@/entities/session'
import type { ProviderInfo, SessionSummary } from '@/entities/session'
import { CheckCircle2, CircleAlert, CircleDot, CircleOff } from 'lucide-react'
import { Button, cn, Tooltip, TooltipCard } from '@convergence/ui'
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
  session: SessionSummary & { projectId: string }
  projectName: string
  kind: 'completed' | 'failed'
}

interface GlobalStatusBarProps {
  meter?: AgentMeterSnapshot
  meterSessions?: SessionSummary[]
  runningCount: number
  attentionCount: number
  byProject: ProjectActivity[]
  recency: RecencyBadge | null
  providers: ProviderInfo[]
  onSelectProject: (projectId: string) => void
  localModelTunnelSlot?: ReactNode
}

export const GlobalStatusBar: FC<GlobalStatusBarProps> = ({
  meter,
  meterSessions = [],
  runningCount,
  attentionCount,
  byProject,
  recency,
  providers,
  onSelectProject,
  localModelTunnelSlot,
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
      {localModelTunnelSlot}
      {isEmpty ? (
        <div className={zoneClass}>
          <CircleOff className="h-3 w-3" />
          <span>No agents running</span>
        </div>
      ) : (
        <>
          <TooltipCard
            side="top"
            className="max-w-sm"
            content={
              <AggregateSummary
                byProject={byProject}
                providerLabel={providerLabel}
              />
            }
          >
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
          </TooltipCard>

          <div
            className={cn(zoneClass, 'min-w-0 flex-1 overflow-hidden')}
            data-testid="global-status-chips"
          >
            {byProject.map((project) => (
              <TooltipCard
                key={project.projectId}
                side="top"
                className="max-w-sm"
                content={
                  <ProjectSummary
                    project={project}
                    providerLabel={providerLabel}
                  />
                }
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onSelectProject(project.projectId)}
                  data-testid={`global-status-chip-${project.projectId}`}
                  aria-label={formatProjectChipLabel(project)}
                  className={cn(
                    'h-auto px-1.5 py-0.5 text-[11px] font-medium shadow-none',
                    projectChipClass,
                    project.needsAttention.length > 0 &&
                      projectChipAttentionClass,
                  )}
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
              </TooltipCard>
            ))}
          </div>
        </>
      )}

      {meter && <AgentMeterSummary snapshot={meter} sessions={meterSessions} />}
      {recency ? (
        <Tooltip
          side="top"
          label={recency.session.name}
          detail={`${recency.kind === 'completed' ? 'Completed' : 'Failed'} · ${providerLabel(recency.session.providerId)}\n${recency.projectName}`}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSelectProject(recency.session.projectId)}
            data-testid="global-status-recency"
            aria-label={`Switch to project ${recency.projectName}`}
            className={cn(
              'h-auto px-1.5 py-0.5 text-[11px] font-medium shadow-none',
              recencyBadgeClass,
            )}
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
        </Tooltip>
      ) : (
        <span className="ml-auto" aria-hidden />
      )}
    </div>
  )
}

function formatProjectChipLabel(project: ProjectActivity): string {
  const parts = [`Switch to project ${project.projectName}`]
  if (project.running.length > 0) {
    parts.push(`${project.running.length} running`)
  }
  if (project.needsAttention.length > 0) {
    parts.push(summarizeAttentionRequests(project.needsAttention))
  }
  return parts.join(', ')
}
