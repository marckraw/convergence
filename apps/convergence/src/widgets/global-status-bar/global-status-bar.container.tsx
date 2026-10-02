import { useEffect, useMemo } from 'react'
import { useAgentMeterStore, watchAgentMeter } from '@/entities/agent-meter'
import type { FC, ReactNode } from 'react'
import { useProjectStore } from '@/entities/project'
import {
  selectGlobalStatus,
  selectLocalProviders,
  useSessionStore,
} from '@/entities/session'
import { LocalModelTunnelStatusContainer } from '@/features/local-model-tunnel'
import { needsYouSessions, needsYouTone } from '@/features/needs-you'
import { GlobalStatusBar } from './global-status-bar.presentational'

interface GlobalStatusBarContainerProps {
  onSelectProject?: (projectId: string) => void | Promise<void>
  /** Show terminal, from the shell, while the workspace has a hidden dock. */
  terminalSlot?: ReactNode
}

export const GlobalStatusBarContainer: FC<GlobalStatusBarContainerProps> = ({
  onSelectProject,
  terminalSlot,
}) => {
  useEffect(watchAgentMeter, [])
  const meter = useAgentMeterStore((state) => state.snapshot)
  const globalSessions = useSessionStore((state) => state.globalSessions)
  const dismissals = useSessionStore((state) => state.needsYouDismissals)
  const providers = useSessionStore(selectLocalProviders)
  const prepareForProject = useSessionStore((state) => state.prepareForProject)
  const projects = useProjectStore((state) => state.projects)
  const activeProject = useProjectStore((state) => state.activeProject)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)

  // "N need you" is one count (ruling 6): the rail and Mission Control derive
  // it from the same sessions with the same function.
  const needsYou = useMemo(
    () => needsYouSessions(globalSessions, dismissals),
    [globalSessions, dismissals],
  )
  const status = useMemo(
    () => selectGlobalStatus(globalSessions, needsYou, projects),
    [globalSessions, needsYou, projects],
  )

  const recency = useMemo(() => {
    if (!status.lastCompleted) return null
    const session = status.lastCompleted
    if (!session.projectId) return null
    const projectName =
      projects.find((project) => project.id === session.projectId)?.name ??
      'Unknown project'
    return {
      session: { ...session, projectId: session.projectId },
      projectName,
      kind:
        session.status === 'failed'
          ? ('failed' as const)
          : ('completed' as const),
    }
  }, [status.lastCompleted, projects])

  const handleSelectProject = (projectId: string) => {
    if (onSelectProject) {
      void onSelectProject(projectId)
      return
    }
    if (activeProject?.id === projectId) return
    prepareForProject(projectId)
    void setActiveProject(projectId)
  }

  return (
    <GlobalStatusBar
      meter={meter}
      meterSessions={globalSessions}
      runningCount={status.running.length}
      attentionCount={needsYou.length}
      attentionTone={needsYouTone(needsYou)}
      byProject={status.byProject}
      recency={recency}
      providers={providers}
      onSelectProject={handleSelectProject}
      localModelTunnelSlot={<LocalModelTunnelStatusContainer />}
      terminalSlot={terminalSlot}
    />
  )
}
