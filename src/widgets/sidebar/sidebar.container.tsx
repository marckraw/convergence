import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { useProjectStore } from '@/entities/project'
import { usePullRequestStore } from '@/entities/pull-request'
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
  ProjectContextSettings,
  ProjectSettingsDialogContainer,
  ProviderStatusDialogContainer,
  ReleaseNotesDialogContainer,
  SkillsBrowserDialogContainer,
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
import type { AppSurface } from '@/shared/types/app-surface.types'
import {
  BarChart3,
  Code2,
  MessageSquareText,
  Plus,
  Settings,
} from 'lucide-react'
import { GlobalChatSessionList } from './global-chat-session-list.presentational'

interface SidebarProps {
  activeSurface: AppSurface
  onSelectSurface: (surface: AppSurface) => void
  onSelectSession: (id: string) => void
  activeSessionId: string | null
  onSelectGlobalSession: (id: string) => void
  onNewGlobalSession: () => void
  activeGlobalSessionId: string | null
}

interface AttentionSession {
  session: SessionSummary
  projectName: string
  summary: string
  priority: number
}

export const Sidebar: FC<SidebarProps> = ({
  activeSurface,
  onSelectSurface,
  onSelectSession,
  activeSessionId,
  onSelectGlobalSession,
  onNewGlobalSession,
  activeGlobalSessionId,
}) => {
  const projects = useProjectStore((s) => s.projects)
  const activeProject = useProjectStore((s) => s.activeProject)
  const createProject = useProjectStore((s) => s.createProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const pullRequestsByWorkspaceId = usePullRequestStore((s) => s.byWorkspaceId)
  const loadPullRequestsByProjectId = usePullRequestStore(
    (s) => s.loadByProjectId,
  )
  const currentBranch = useWorkspaceStore((s) => s.currentBranch)
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces)
  const loadCurrentBranch = useWorkspaceStore((s) => s.loadCurrentBranch)
  const archiveWorkspace = useWorkspaceStore((s) => s.archiveWorkspace)
  const unarchiveWorkspace = useWorkspaceStore((s) => s.unarchiveWorkspace)
  const removeWorkspaceWorktree = useWorkspaceStore(
    (s) => s.removeWorkspaceWorktree,
  )
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace)
  const openDialog = useDialogStore((s) => s.open)
  const sessions = useSessionStore((s) => s.sessions)
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const globalChatSessions = useSessionStore((s) => s.globalChatSessions)
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
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    () => new Set(),
  )

  const toggleWorkspace = useCallback((id: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const expandWorkspace = useCallback((id: string) => {
    setExpandedWorkspaces((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

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

  const workspaceIdsKey = workspaces.map((workspace) => workspace.id).join('|')

  useEffect(() => {
    if (activeProject) {
      loadWorkspaces(activeProject.id)
      loadCurrentBranch(activeProject.repositoryPath)
      loadSessions(activeProject.id)
    }
  }, [activeProject, loadWorkspaces, loadCurrentBranch, loadSessions])

  useEffect(() => {
    if (activeProject) {
      void loadPullRequestsByProjectId(activeProject.id)
    }
  }, [activeProject, loadPullRequestsByProjectId, workspaceIdsKey])

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
        session.contextKind === 'global'
          ? 'Convergence'
          : (projects.find((project) => project.id === session.projectId)
              ?.name ?? 'Unknown project')

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

  const visibleAttentionSessions = attentionSessions.filter(({ session }) =>
    activeSurface === 'chat'
      ? session.contextKind === 'global'
      : session.contextKind === 'project',
  )

  const waitingSessions = visibleAttentionSessions.filter(
    ({ session }) =>
      session.attention === 'needs-approval' ||
      session.attention === 'needs-input',
  )
  const reviewSessions = visibleAttentionSessions.filter(
    ({ session }) =>
      session.attention === 'finished' || session.attention === 'failed',
  )

  const handleSelectNeedsYouSession = async (sessionId: string) => {
    const target = globalSessions.find((session) => session.id === sessionId)
    await switchToSession(sessionId)
    onSelectSurface(target?.contextKind === 'global' ? 'chat' : 'code')
    if (target?.workspaceId) {
      expandWorkspace(target.workspaceId)
    }
    if (target?.contextKind === 'global') {
      onSelectGlobalSession(sessionId)
      return
    }
    onSelectSession(sessionId)
  }

  const handleArchiveWorkspace = async (workspaceId: string) => {
    if (!activeProject) {
      return
    }

    const workspace = workspaces.find((entry) => entry.id === workspaceId)
    const branchName = workspace?.branchName ?? 'workspace'
    const confirmed = window.confirm(
      `Archive workspace "${branchName}"?\n\nThis will hide the workspace from the active sidebar and archive all sessions inside it. Conversation history will be kept.`,
    )
    if (!confirmed) return

    const pullRequest = pullRequestsByWorkspaceId[workspaceId]
    const removeWorktree =
      pullRequest?.state === 'merged'
        ? window.confirm(
            'This workspace PR is merged. Also remove the git worktree from disk?',
          )
        : false

    await archiveWorkspace(workspaceId, activeProject.id, removeWorktree)
    await loadSessions(activeProject.id)
    await loadGlobalSessions()
    await loadRecents()
  }

  const handleUnarchiveWorkspace = async (workspaceId: string) => {
    if (!activeProject) {
      return
    }

    await unarchiveWorkspace(workspaceId, activeProject.id)
    await loadSessions(activeProject.id)
    await loadGlobalSessions()
    await loadRecents()
  }

  const handleRemoveWorkspaceWorktree = async (workspaceId: string) => {
    if (!activeProject) {
      return
    }

    const workspace = workspaces.find((entry) => entry.id === workspaceId)
    const branchName = workspace?.branchName ?? 'workspace'
    const confirmed = window.confirm(
      `Remove git worktree for "${branchName}" from disk?\n\nConvergence will keep the workspace and conversation history, but this workspace cannot be used for new agent work until restore support exists.`,
    )
    if (!confirmed) return

    await removeWorkspaceWorktree(workspaceId, activeProject.id)
  }

  const handleDeleteWorkspace = async (workspaceId: string) => {
    if (!activeProject) {
      return
    }

    const workspace = workspaces.find((entry) => entry.id === workspaceId)
    const branchName = workspace?.branchName ?? 'workspace'
    const confirmed = window.confirm(
      `Permanently delete workspace "${branchName}"?\n\nThis deletes the workspace and all sessions/conversations inside it. This cannot be undone.`,
    )
    if (!confirmed) return

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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Insights"
            aria-label="Open insights"
            onClick={() =>
              openDialog('app-settings', { appSettingsSection: 'insights' })
            }
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
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

      <div className="flex items-center gap-1 px-3 pt-3">
        <Button
          type="button"
          variant={activeSurface === 'code' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          title="Code"
          aria-label="Show code surface"
          aria-pressed={activeSurface === 'code'}
          onClick={() => onSelectSurface('code')}
        >
          <Code2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={activeSurface === 'chat' ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          title="Chat"
          aria-label="Show chat surface"
          aria-pressed={activeSurface === 'chat'}
          onClick={() => onSelectSurface('chat')}
        >
          <MessageSquareText className="h-4 w-4" />
        </Button>
      </div>

      <div className="app-scrollbar flex-1 overflow-x-hidden overflow-y-auto py-3">
        <NeedsYou
          waitingSessions={waitingSessions}
          reviewSessions={reviewSessions}
          activeSessionId={
            activeSurface === 'chat' ? activeGlobalSessionId : activeSessionId
          }
          pulsingSessionIds={pulsingSessionIds}
          onSelect={handleSelectNeedsYouSession}
          onDismiss={dismissNeedsYouSession}
          onArchive={archiveSession}
        />

        {visibleAttentionSessions.length > 0 && (
          <div className="mx-3 mb-3 border-t border-border/50" />
        )}

        {activeSurface === 'chat' ? (
          <GlobalChatSessionList
            sessions={globalChatSessions}
            activeSessionId={activeGlobalSessionId}
            onNewSession={onNewGlobalSession}
            onSelectSession={onSelectGlobalSession}
            onArchiveSession={archiveSession}
            onUnarchiveSession={unarchiveSession}
            onDeleteSession={(sessionId: string) =>
              deleteSession(sessionId, null)
            }
          />
        ) : (
          <>
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
                pullRequestsByWorkspaceId={pullRequestsByWorkspaceId}
                pulsingSessionIds={pulsingSessionIds}
                expandedWorkspaces={expandedWorkspaces}
                onToggleWorkspace={toggleWorkspace}
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
                onArchiveWorkspace={handleArchiveWorkspace}
                onUnarchiveWorkspace={handleUnarchiveWorkspace}
                onRemoveWorkspaceWorktree={handleRemoveWorkspaceWorktree}
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
          </>
        )}
      </div>

      <div className="app-sidebar-footer border-t border-white/10 p-3">
        {activeSurface === 'code' ? (
          <>
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
              <ProjectSettingsDialogContainer
                contextSection={(projectId) => (
                  <ProjectContextSettings projectId={projectId} />
                )}
              />
            </div>
          </>
        ) : null}
        <div className="mt-2">
          <ProviderStatusDialogContainer />
        </div>
        <div className="mt-2">
          <McpServersDialogContainer />
        </div>
        <div className="mt-2">
          <SkillsBrowserDialogContainer />
        </div>
        <div className="mt-2">
          <ReleaseNotesDialogContainer />
        </div>
      </div>

      {activeSurface === 'code' ? <WorkspaceCreateDialogContainer /> : null}
    </div>
  )
}
