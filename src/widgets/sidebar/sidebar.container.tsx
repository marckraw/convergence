import { useEffect } from 'react'
import type { FC } from 'react'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSessionStore } from '@/entities/session'
import { ThemeToggleButton } from '@/features/theme-toggle'
import { NeedsYou } from './needs-you.presentational'
import { ProjectTree } from './project-tree.container'
import { ProjectSwitcher } from './project-switcher.presentational'
import { Button } from '@/shared/ui/button'
import { Plus } from 'lucide-react'

interface SidebarProps {
  onSelectSession: (id: string) => void
  activeSessionId: string | null
}

export const Sidebar: FC<SidebarProps> = ({
  onSelectSession,
  activeSessionId,
}) => {
  const projects = useProjectStore((s) => s.projects)
  const activeProject = useProjectStore((s) => s.activeProject)
  const createProject = useProjectStore((s) => s.createProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const currentBranch = useWorkspaceStore((s) => s.currentBranch)
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces)
  const loadCurrentBranch = useWorkspaceStore((s) => s.loadCurrentBranch)
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace)
  const sessions = useSessionStore((s) => s.sessions)
  const loadSessions = useSessionStore((s) => s.loadSessions)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  useEffect(() => {
    if (activeProject) {
      loadWorkspaces(activeProject.id)
      loadCurrentBranch(activeProject.repositoryPath)
      loadSessions(activeProject.id)
    }
  }, [activeProject, loadWorkspaces, loadCurrentBranch, loadSessions])

  const needsYouSessions = sessions.filter(
    (s) => s.attention === 'needs-approval' || s.attention === 'needs-input',
  )

  const handleDeleteWorkspace = async (workspaceId: string) => {
    if (!activeProject) {
      return
    }

    const deletedSessionIds = sessions
      .filter((session) => session.workspaceId === workspaceId)
      .map((session) => session.id)

    await deleteWorkspace(workspaceId, activeProject.id)
    await loadSessions(activeProject.id)

    if (activeSessionId && deletedSessionIds.includes(activeSessionId)) {
      setActiveSession(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="app-sidebar-topbar flex h-12 items-center justify-end border-b border-white/10 px-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ThemeToggleButton />
        </div>
      </div>

      <div className="app-scrollbar flex-1 overflow-y-auto py-3">
        <NeedsYou
          sessions={needsYouSessions}
          activeSessionId={activeSessionId}
          onSelect={onSelectSession}
        />

        {needsYouSessions.length > 0 && (
          <div className="mx-3 mb-3 border-t border-border/50" />
        )}

        {projects.length > 0 && (
          <ProjectSwitcher
            projects={projects}
            activeProjectId={activeProject?.id ?? null}
            onSelectProject={setActiveProject}
            onCreateProject={createProject}
          />
        )}

        {activeProject ? (
          <ProjectTree
            baseBranchName={currentBranch}
            workspaces={workspaces}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onDeleteSession={(sessionId: string) =>
              deleteSession(sessionId, activeProject.id)
            }
            onDeleteWorkspace={handleDeleteWorkspace}
            onCreateWorkspace={(branchName: string) =>
              createWorkspace(activeProject.id, branchName)
            }
          />
        ) : (
          <div className="px-3 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              No project loaded
            </p>
          </div>
        )}
      </div>

      <div className="app-sidebar-footer border-t border-white/10 p-3">
        <Button
          variant="outline"
          size="sm"
          onClick={createProject}
          className="w-full"
        >
          <Plus className="h-4 w-4" />
          {activeProject ? 'New Project' : 'Create Project'}
        </Button>
      </div>
    </div>
  )
}
