import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import {
  sessionApi,
  useSessionStore,
  type SessionSummary,
} from '@/entities/session'
import { useNotificationsStore } from '@/entities/notifications'
import {
  AppSettingsDialogContainer,
  InitiativeWorkboardDialogContainer,
  McpServersDialogContainer,
  ProjectSettingsDialogContainer,
  ProviderStatusDialogContainer,
  ReleaseNotesDialogContainer,
  ThemeToggleButton,
  WorkspaceCreateDialogContainer,
} from '@/features'
import { switchToSession } from '@/features/command-center'
import { useDialogStore } from '@/entities/dialog'
import { NeedsYou } from './needs-you.presentational'
import { buildNeedsYouSummary } from './needs-you.presentational'
import { ProjectTree } from './project-tree.container'
import { ProjectSwitcher } from './project-switcher.presentational'
import { Button } from '@/shared/ui/button'
import { Plus, Settings } from 'lucide-react'

interface SidebarProps {
  onSelectSession: (id: string) => void
  activeSessionId: string | null
}

interface AttentionSession {
  session: SessionSummary
  projectName: string
  summary: string
  priority: number
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
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace)
  const openDialog = useDialogStore((s) => s.open)
  const sessions = useSessionStore((s) => s.sessions)
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const needsYouDismissals = useSessionStore((s) => s.needsYouDismissals)
  const loadSessions = useSessionStore((s) => s.loadSessions)
  const loadGlobalSessions = useSessionStore((s) => s.loadGlobalSessions)
  const loadRecents = useSessionStore((s) => s.loadRecents)
  const archiveSession = useSessionStore((s) => s.archiveSession)
  const unarchiveSession = useSessionStore((s) => s.unarchiveSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const dismissNeedsYouSession = useSessionStore(
    (s) => s.dismissNeedsYouSession,
  )
  const prepareForProject = useSessionStore((s) => s.prepareForProject)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const pulsingSessionIds = useNotificationsStore((s) => s.pulsingSessionIds)
  const [regeneratingSessionIds, setRegeneratingSessionIds] = useState<
    ReadonlySet<string>
  >(() => new Set())

  const handleRegenerateSessionName = useCallback((sessionId: string) => {
    setRegeneratingSessionIds((prev) => {
      if (prev.has(sessionId)) return prev
      const next = new Set(prev)
      next.add(sessionId)
      return next
    })
    sessionApi.regenerateName(sessionId).finally(() => {
      setRegeneratingSessionIds((prev) => {
        if (!prev.has(sessionId)) return prev
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
    })
  }, [])

  useEffect(() => {
    if (activeProject) {
      loadWorkspaces(activeProject.id)
      loadCurrentBranch(activeProject.repositoryPath)
      loadSessions(activeProject.id)
    }
  }, [activeProject, loadWorkspaces, loadCurrentBranch, loadSessions])

  const attentionSessions = globalSessions
    .map((session) => {
      if (session.archivedAt) {
        return null
      }

      const summary = buildNeedsYouSummary(session)
      if (!summary) {
        return null
      }

      if (needsYouDismissals[session.id]?.updatedAt === session.updatedAt) {
        return null
      }

      const projectName =
        projects.find((project) => project.id === session.projectId)?.name ??
        'Unknown project'

      return {
        session,
        projectName,
        summary: summary.summary,
        priority: summary.priority,
      }
    })
    .filter((value): value is AttentionSession => value !== null)
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority
      }

      return right.session.updatedAt.localeCompare(left.session.updatedAt)
    })

  const waitingSessions = attentionSessions.filter(
    ({ session }) =>
      session.attention === 'needs-approval' ||
      session.attention === 'needs-input',
  )
  const reviewSessions = attentionSessions.filter(
    ({ session }) =>
      session.attention === 'finished' || session.attention === 'failed',
  )

  const handleSelectNeedsYouSession = async (sessionId: string) => {
    await switchToSession(sessionId)
    onSelectSession(sessionId)
  }

  const handleDeleteWorkspace = async (workspaceId: string) => {
    if (!activeProject) {
      return
    }

    const deletedSessionIds = sessions
      .filter((session) => session.workspaceId === workspaceId)
      .map((session) => session.id)

    await deleteWorkspace(workspaceId, activeProject.id)
    await loadSessions(activeProject.id)
    await loadGlobalSessions()
    await loadRecents()

    if (activeSessionId && deletedSessionIds.includes(activeSessionId)) {
      setActiveSession(null)
    }
  }

  const handleSelectProject = async (projectId: string) => {
    prepareForProject(projectId)
    await setActiveProject(projectId)
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="app-sidebar-topbar flex h-12 items-center justify-end border-b border-white/10 px-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <AppSettingsDialogContainer
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Settings"
                aria-label="Open settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            }
          />
          <ThemeToggleButton />
        </div>
      </div>

      <div className="app-scrollbar flex-1 overflow-x-hidden overflow-y-auto py-3">
        <NeedsYou
          waitingSessions={waitingSessions}
          reviewSessions={reviewSessions}
          activeSessionId={activeSessionId}
          pulsingSessionIds={pulsingSessionIds}
          onSelect={handleSelectNeedsYouSession}
          onDismiss={dismissNeedsYouSession}
          onArchive={archiveSession}
        />

        {attentionSessions.length > 0 && (
          <div className="mx-3 mb-3 border-t border-border/50" />
        )}

        {projects.length > 0 && (
          <ProjectSwitcher
            projects={projects}
            activeProjectId={activeProject?.id ?? null}
            onSelectProject={handleSelectProject}
            onCreateProject={createProject}
          />
        )}

        {activeProject ? (
          <ProjectTree
            baseBranchName={currentBranch}
            workspaces={workspaces}
            sessions={sessions}
            activeSessionId={activeSessionId}
            pulsingSessionIds={pulsingSessionIds}
            onSelectSession={onSelectSession}
            onArchiveSession={archiveSession}
            onUnarchiveSession={unarchiveSession}
            onDeleteSession={(sessionId: string) =>
              deleteSession(sessionId, activeProject.id)
            }
            onRenameSession={(sessionId: string, name: string) =>
              sessionApi.rename(sessionId, name).catch(() => undefined)
            }
            regeneratingSessionIds={regeneratingSessionIds}
            onRegenerateSessionName={handleRegenerateSessionName}
            onDeleteWorkspace={handleDeleteWorkspace}
            onOpenCreateWorkspace={() => openDialog('workspace-create')}
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
          Open a project
        </Button>
        <div className="mt-2">
          <InitiativeWorkboardDialogContainer />
        </div>
        <div className="mt-2">
          <ProjectSettingsDialogContainer />
        </div>
        <div className="mt-2">
          <ProviderStatusDialogContainer />
        </div>
        <div className="mt-2">
          <McpServersDialogContainer />
        </div>
        <div className="mt-2">
          <ReleaseNotesDialogContainer />
        </div>
      </div>

      <WorkspaceCreateDialogContainer />
    </div>
  )
}
