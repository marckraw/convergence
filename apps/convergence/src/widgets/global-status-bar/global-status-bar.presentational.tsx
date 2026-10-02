import type { FC, ReactNode } from 'react'
import type { AgentMeterSnapshot } from '@/shared/types/agent-meter.types'
import { AgentMeterSummary } from './agent-meter-summary.presentational'
import type { ProjectActivity } from '@/entities/session'
import { summarizeAttentionRequests } from '@/entities/session'
import {
  needsYouCount,
  needsYouTone,
  needsYouVerb,
  type NeedsYouTone,
} from '@/features/needs-you'
import type { ProviderInfo, SessionSummary } from '@/entities/session'
import { CheckCircle2, CircleAlert, CircleDot, CircleOff } from 'lucide-react'
import {
  cn,
  StatusDot,
  StatusPillButton,
  toneInk,
  toneLine,
  toneSoft,
  Tooltip,
  TooltipCard,
} from '@convergence/ui'
import { AggregateSummary } from './aggregate-summary.presentational'
import { ProjectSummary } from './project-summary.presentational'
import {
  aggregateChipClass,
  aggregateZoneClass,
  barClass,
  barTone,
  chipNameClass,
  recencyBadgeClass,
  recencyNameClass,
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
  /** What "N need you" counts (ruling 6). */
  attentionCount: number
  /** Its tone (R1): warning while anything asks, danger for failed runs alone. */
  attentionTone: NeedsYouTone | null
  byProject: ProjectActivity[]
  recency: RecencyBadge | null
  providers: ProviderInfo[]
  onSelectProject: (projectId: string) => void
  localModelTunnelSlot?: ReactNode
  /**
   * At the bar's end: the way back to a hidden terminal dock (Show
   * terminal), handed in by the shell while the workspace on screen has one.
   */
  terminalSlot?: ReactNode
}

export const GlobalStatusBar: FC<GlobalStatusBarProps> = ({
  meter,
  meterSessions = [],
  runningCount,
  attentionCount,
  attentionTone,
  byProject,
  recency,
  providers,
  onSelectProject,
  localModelTunnelSlot,
  terminalSlot,
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
              aria-label={`Agents: ${runningCount} running, ${needsYouCount(attentionCount)}`}
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
                  attentionTone && [
                    toneLine[attentionTone],
                    toneSoft[attentionTone],
                    toneInk[attentionTone],
                  ],
                )}
              >
                <CircleAlert
                  className={cn(
                    'h-3 w-3',
                    attentionTone ? toneInk[attentionTone] : 'text-ink-muted',
                  )}
                />
                <span>
                  <span
                    className={cn(
                      'font-medium',
                      attentionTone ? toneInk[attentionTone] : 'text-ink',
                    )}
                  >
                    {attentionCount}
                  </span>{' '}
                  {needsYouVerb(attentionCount)}
                </span>
              </div>
            </div>
          </TooltipCard>

          <div
            className={cn(zoneClass, 'min-w-0 flex-1 overflow-hidden')}
            data-testid="global-status-chips"
          >
            {byProject.map((project) => {
              const projectTone = needsYouTone(project.needsAttention)
              return (
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
                  <StatusPillButton
                    type="button"
                    onClick={() => onSelectProject(project.projectId)}
                    data-testid={`global-status-chip-${project.projectId}`}
                    aria-label={formatProjectChipLabel(project)}
                    // Something waits on you here: warning while anything
                    // asks, danger when only a failed run waits (R1, ruling 6).
                    tone={projectTone ?? 'neutral'}
                    leading={
                      <StatusDot
                        size="sm"
                        tone={projectTone ?? barTone.running}
                      />
                    }
                  >
                    <span className={chipNameClass}>{project.projectName}</span>{' '}
                    <span className="text-ink-muted">
                      {project.running.length > 0 && (
                        <span>{project.running.length}▸</span>
                      )}
                      {projectTone && (
                        <span className={cn('ml-1', toneInk[projectTone])}>
                          {project.needsAttention.length}!
                        </span>
                      )}
                    </span>
                  </StatusPillButton>
                </TooltipCard>
              )
            })}
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
          <StatusPillButton
            type="button"
            onClick={() => onSelectProject(recency.session.projectId)}
            data-testid="global-status-recency"
            aria-label={`Switch to project ${recency.projectName}`}
            className={recencyBadgeClass}
            leading={
              recency.kind === 'completed' ? (
                <CheckCircle2 className="h-3 w-3 text-success-ink" />
              ) : (
                <CircleAlert className="h-3 w-3 text-danger-ink" />
              )
            }
          >
            <span className={recencyNameClass}>{recency.session.name}</span>{' '}
            <span className="text-ink-muted">· {recency.projectName}</span>
          </StatusPillButton>
        </Tooltip>
      ) : (
        <span className="ml-auto" aria-hidden />
      )}
      {terminalSlot}
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
