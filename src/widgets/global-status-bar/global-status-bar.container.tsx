import { useMemo } from 'react'
import type { FC } from 'react'
import { useProjectStore } from '@/entities/project'
import { selectGlobalStatus, useSessionStore } from '@/entities/session'
import { GlobalStatusBar } from './global-status-bar.presentational'

export const GlobalStatusBarContainer: FC = () => {
  const globalSessions = useSessionStore((state) => state.globalSessions)
  const dismissals = useSessionStore((state) => state.needsYouDismissals)
  const providers = useSessionStore((state) => state.providers)
  const prepareForProject = useSessionStore((state) => state.prepareForProject)
  const projects = useProjectStore((state) => state.projects)
  const activeProject = useProjectStore((state) => state.activeProject)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)

  const status = useMemo(
    () => selectGlobalStatus(globalSessions, dismissals, projects),
    [globalSessions, dismissals, projects],
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
    if (activeProject?.id === projectId) return
    prepareForProject(projectId)
    void setActiveProject(projectId)
  }

  return (
    <GlobalStatusBar
      runningCount={status.running.length}
      attentionCount={status.needsAttention.length}
      byProject={status.byProject}
      recency={recency}
      providers={providers}
      onSelectProject={handleSelectProject}
    />
  )
}
