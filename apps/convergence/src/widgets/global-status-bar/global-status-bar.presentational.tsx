import type { FC, ReactNode } from 'react'
import type { AgentMeterSnapshot } from '@/shared/types/agent-meter.types'
import { AgentMeterSummary } from './agent-meter-summary.presentational'
import type { ProjectActivity } from '@/entities/session'
import { summarizeAttentionRequests } from '@/entities/session'
import type { ProviderInfo, SessionSummary } from '@/entities/session'
import { CheckCircle2, CircleAlert, CircleDot, CircleOff } from 'lucide-react'
import { Button, cn, StatusDot, Tooltip, TooltipCard } from '@convergence/ui'
import { AggregateSummary } from './aggregate-summary.presentational'
import { ProjectSummary } from './project-summary.presentational'
import {
  aggregateChipClass,
  aggregateZoneClass,
  barClass,
  barTone,
  projectChipAttentionClass,
  projectChipClass,
  recencyBadgeClass,
  statusChipButtonClass,
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
    // The window's foot: the shell's contentinfo landmark (NAV-26).
    <footer className={barClass} data-testid="global-status-bar">
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
            {/* A stop for the keyboard: its focus opens the summary, as the
                pointer's hover does (NAV-26). */}
            <div
              role="group"
              tabIndex={0}
              aria-label={`Agents: ${runningCount} running, ${attentionCount} need you`}
              className={aggregateZoneClass}
              data-testid="global-status-aggregate"
            >
              <div className={aggregateChipClass}>
                <CircleDot className="h-3 w-3 text-info-ink" />
                <span>
                  <span className="font-medium text-ink">{runningCount}</span>{' '}
                  running
                </span>
              </div>
              <div
                className={cn(
                  aggregateChipClass,
                  attentionCount > 0 &&
                    'border-warning-line bg-warning-soft text-warning-ink',
                )}
              >
                <CircleAlert
                  className={cn(
                    'h-3 w-3',
                    attentionCount > 0 ? 'text-warning-ink' : 'text-ink-muted',
                  )}
                />
                <span>
                  <span
                    className={cn(
                      'font-medium',
                      attentionCount > 0 ? 'text-warning-ink' : 'text-ink',
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
                    statusChipButtonClass,
                    projectChipClass,
                    project.needsAttention.length > 0 &&
                      projectChipAttentionClass,
                  )}
                >
                  <StatusDot
                    size="sm"
                    tone={
                      project.needsAttention.length > 0
                        ? barTone.waiting
                        : barTone.running
                    }
                  />
                  <span className="max-w-32 truncate">
                    {project.projectName}
                  </span>
                  <span className="text-ink-muted">
                    {project.running.length > 0 && (
                      <span>{project.running.length}▸</span>
                    )}
                    {project.needsAttention.length > 0 && (
                      <span className="ml-1 text-warning-ink">
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
            className={cn(statusChipButtonClass, recencyBadgeClass)}
          >
            {recency.kind === 'completed' ? (
              <CheckCircle2 className="h-3 w-3 text-success-ink" />
            ) : (
              <CircleAlert className="h-3 w-3 text-danger-ink" />
            )}
            <span className="max-w-28 truncate">{recency.session.name}</span>
            <span className="text-ink-muted">· {recency.projectName}</span>
          </Button>
        </Tooltip>
      ) : (
        <span className="ml-auto" aria-hidden />
      )}
    </footer>
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
