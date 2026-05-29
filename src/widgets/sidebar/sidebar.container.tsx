import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useProjectStore } from '@/entities/project'
import { usePullRequestStore } from '@/entities/pull-request'
import { useSpaceStore } from '@/entities/space'
import { useWorkspaceStore } from '@/entities/workspace'
import {
  sessionApi,
  useSessionStore,
  type SessionSummary,
} from '@/entities/session'
import { useTerminalStore, type TerminalIdleNotice } from '@/entities/terminal'
import type { CodeReviewMode } from '@/entities/code-review'
import { useNotificationsStore } from '@/entities/notifications'
import { useTaskProgressStore } from '@/entities/task-progress'
import {
  AppSettingsDialogContainer,
  SpaceWorkboardDialogContainer,
  McpServersDialogContainer,
  ProjectContextSettings,
  ProjectSettingsDialogContainer,
  PromptLibraryBrowserDialogContainer,
  ProviderStatusDialogContainer,
  ReleaseNotesDialogContainer,
  SkillsBrowserDialogContainer,
  SpaceCreateDialogContainer,
  ThemeToggleButton,
  WorkspaceCreateDialogContainer,
} from '@/features'
import { switchToSession } from '@/features/command-center'
import { useDialogStore } from '@/entities/dialog'
import { NeedsYou } from './needs-you.presentational'
import { buildNeedsYouSummary } from './needs-you.presentational'
import { TerminalIdleSection } from './terminal-idle-section.presentational'
import { ProjectTree } from './project-tree.container'
import { ProjectSwitcher } from './project-switcher.presentational'
import { Button } from '@/shared/ui/button'
import type { AppSurface } from '@/shared/types/app-surface.types'
import { cn } from '@/shared/lib/cn.pure'
import {
  BarChart3,
  ChevronRight,
  Code2,
  FolderGit2,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
  Settings,
} from 'lucide-react'
import {
  GlobalChatSessionList,
  type ChatSidebarSpace,
} from './global-chat-session-list.presentational'
import { SidebarToolsMenu } from './sidebar-tools-menu.presentational'
import { toast } from 'sonner'

interface SidebarProps {
  activeSurface: AppSurface
  onSelectSurface: (surface: AppSurface) => void
  onSelectSession: (id: string) => void
  activeSessionId: string | null
  onSelectGlobalSession: (id: string) => void
  onNewGlobalSession: () => void
  selectedSpaceId: string | null
  onSelectSpace: (id: string) => void
  activeGlobalSessionId: string | null
  onOpenCodeReview?: (search?: {
    targetId?: string | null
    mode?: CodeReviewMode
    file?: string | null
  }) => void
  onSelectProjectRoot?: (projectId: string) => void | Promise<void>
  onSelectAnySession?: (session: SessionSummary) => void
  collapsed: boolean
  peek: boolean
  onCollapse: () => void
  onExpand: () => void
  onPeek: () => void
  onPinPeek: () => void
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
  selectedSpaceId,
  onSelectSpace,
  activeGlobalSessionId,
  onOpenCodeReview,
  onSelectProjectRoot,
  onSelectAnySession,
  collapsed,
  peek,
  onCollapse,
  onExpand,
  onPeek,
  onPinPeek,
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
  const syncWorkspaceEnvFiles = useWorkspaceStore(
    (s) => s.syncWorkspaceEnvFiles,
  )
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace)
  const openDialog = useDialogStore((s) => s.open)
  const sessions = useSessionStore((s) => s.sessions)
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const globalChatSessions = useSessionStore((s) => s.globalChatSessions)
  const needsYouDismissals = useSessionStore((s) => s.needsYouDismissals)
  const loadSessions = useSessionStore((s) => s.loadSessions)
  const loadGlobalSessions = useSessionStore((s) => s.loadGlobalSessions)
  const loadGlobalChatSessions = useSessionStore(
    (s) => s.loadGlobalChatSessions,
  )
  const loadRecents = useSessionStore((s) => s.loadRecents)
  const archiveSession = useSessionStore((s) => s.archiveSession)
  const unarchiveSession = useSessionStore((s) => s.unarchiveSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const dismissNeedsYouSession = useSessionStore(
    (s) => s.dismissNeedsYouSession,
  )
  const prepareForProject = useSessionStore((s) => s.prepareForProject)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const spaces = useSpaceStore((s) => s.spaces)
  const attemptsBySpaceId = useSpaceStore((s) => s.attemptsBySpaceId)
  const loadSpaces = useSpaceStore((s) => s.loadSpaces)
  const loadSpaceAttempts = useSpaceStore((s) => s.loadAttempts)
  const archiveSpace = useSpaceStore((s) => s.archiveSpace)
  const unarchiveSpace = useSpaceStore((s) => s.unarchiveSpace)
  const unlinkSpaceAttempt = useSpaceStore((s) => s.unlinkAttempt)
  const pulsingSessionIds = useNotificationsStore((s) => s.pulsingSessionIds)
  const terminalIdleNotices = useTerminalStore((s) => s.idleNotices)
  const dismissTerminalIdleNotice = useTerminalStore(
    (s) => s.dismissTerminalIdleNotice,
  )
  const focusTerminalTab = useTerminalStore((s) => s.focusTerminalTab)
  const [regeneratingSessionRequests, setRegeneratingSessionRequests] =
    useState<Record<string, string>>({})
  const regeneratingSessionIds = useMemo(
    () => new Set(Object.keys(regeneratingSessionRequests)),
    [regeneratingSessionRequests],
  )
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    () => new Set(),
  )
  const [expandedSpaceIds, setExpandedSpaceIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [archivedSpacesExpanded, setArchivedSpacesExpanded] = useState(false)

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

  const toggleSpace = useCallback((id: string) => {
    setExpandedSpaceIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleArchivedSpaces = useCallback(() => {
    setArchivedSpacesExpanded((current) => !current)
  }, [])

  const handleRegenerateSessionName = useCallback(
    (sessionId: string) => {
      if (regeneratingSessionRequests[sessionId]) return

      const requestId = crypto.randomUUID()
      const toastId = `session-name:${sessionId}`
      setRegeneratingSessionRequests((prev) => ({
        ...prev,
        [sessionId]: requestId,
      }))
      toast.loading('Regenerating session name...', { id: toastId })

      void sessionApi
        .regenerateName(sessionId, requestId)
        .then(({ updated }) => {
          const progress =
            useTaskProgressStore.getState().snapshots[requestId] ?? null
          const outcome = progress?.settled?.outcome ?? null
          if (outcome === 'error' || outcome === 'timeout') {
            toast.error('Could not regenerate name', {
              id: toastId,
              description:
                outcome === 'timeout'
                  ? 'The naming request timed out.'
                  : 'The provider returned an error.',
            })
            return
          }
          if (updated) {
            toast.success('Session name regenerated', { id: toastId })
            return
          }
          toast('No new name generated', {
            id: toastId,
            description: 'The provider returned no usable title.',
          })
        })
        .catch(() => {
          toast.error('Could not start name regeneration', { id: toastId })
        })
        .finally(() => {
          setRegeneratingSessionRequests((prev) => {
            if (!prev[sessionId]) return prev
            const next = { ...prev }
            delete next[sessionId]
            return next
          })
        })
    },
    [regeneratingSessionRequests],
  )

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

  useEffect(() => {
    if (activeSurface !== 'chat') return
    void loadSpaces()
  }, [activeSurface, loadSpaces])

  useEffect(() => {
    if (activeSurface !== 'chat') return
    for (const space of spaces) {
      void loadSpaceAttempts(space.id)
    }
  }, [activeSurface, loadSpaceAttempts, spaces])

  useEffect(() => {
    if (activeSurface !== 'chat' || !selectedSpaceId) return
    const selectedSpace = spaces.find((space) => space.id === selectedSpaceId)
    if (selectedSpace?.archivedAt) {
      setArchivedSpacesExpanded(true)
    }
  }, [activeSurface, selectedSpaceId, spaces])

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
    if (target && onSelectAnySession) {
      onSelectAnySession(target)
      if (target.workspaceId) {
        expandWorkspace(target.workspaceId)
      }
      return
    }
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

  const handleSelectTerminalIdleNotice = async (notice: TerminalIdleNotice) => {
    const target = sessionLookup.get(notice.sessionId)
    if (target && onSelectAnySession) {
      onSelectAnySession(target)
      if (target.workspaceId) {
        expandWorkspace(target.workspaceId)
      }
      focusTerminalTab(notice.sessionId, notice.terminalId)
      dismissTerminalIdleNotice(notice.terminalId)
      return
    }

    await switchToSession(notice.sessionId)
    onSelectSurface(target?.contextKind === 'global' ? 'chat' : 'code')
    if (target?.workspaceId) {
      expandWorkspace(target.workspaceId)
    }
    if (target?.contextKind === 'global') {
      onSelectGlobalSession(notice.sessionId)
    } else {
      onSelectSession(notice.sessionId)
    }
    focusTerminalTab(notice.sessionId, notice.terminalId)
    dismissTerminalIdleNotice(notice.terminalId)
  }

  const sessionLookup = useMemo(() => {
    const next = new Map<string, SessionSummary>()
    for (const session of globalSessions) next.set(session.id, session)
    for (const session of globalChatSessions) next.set(session.id, session)
    for (const session of sessions) next.set(session.id, session)
    return next
  }, [globalChatSessions, globalSessions, sessions])

  const chatSpaces = useMemo<ChatSidebarSpace[]>(
    () =>
      spaces.map((space) => ({
        id: space.id,
        title: space.title,
        archivedAt: space.archivedAt ?? null,
        attempts: (attemptsBySpaceId[space.id] ?? []).map((attempt) => {
          const session = sessionLookup.get(attempt.sessionId) ?? null
          return {
            attemptId: attempt.id,
            sessionId: attempt.sessionId,
            sessionName: session?.name ?? 'Unknown session',
            role: attempt.role,
            session,
          }
        }),
      })),
    [attemptsBySpaceId, sessionLookup, spaces],
  )

  const linkedChatSessionIds = useMemo(() => {
    const next = new Set<string>()
    for (const space of chatSpaces) {
      for (const attempt of space.attempts) {
        if (attempt.session?.contextKind === 'global') {
          next.add(attempt.sessionId)
        }
      }
    }
    return next
  }, [chatSpaces])

  const ungroupedGlobalChatSessions = useMemo(
    () =>
      globalChatSessions.filter(
        (session) => !linkedChatSessionIds.has(session.id),
      ),
    [globalChatSessions, linkedChatSessionIds],
  )

  const handleSpaceCreated = useCallback(
    (space: { id: string }) => {
      setExpandedSpaceIds((prev) => {
        const next = new Set(prev)
        next.add(space.id)
        return next
      })
      onSelectSpace(space.id)
    },
    [onSelectSpace],
  )

  const handleSelectSpaceAttempt = async (sessionId: string) => {
    const target = sessionLookup.get(sessionId)
    if (!target) return

    if (onSelectAnySession) {
      onSelectAnySession(target)
      if (target.workspaceId) {
        expandWorkspace(target.workspaceId)
      }
      return
    }

    await switchToSession(sessionId)

    if (target?.contextKind === 'global') {
      onSelectSurface('chat')
      onSelectGlobalSession(sessionId)
      return
    }

    onSelectSurface('code')
    if (target?.workspaceId) {
      expandWorkspace(target.workspaceId)
    }
    onSelectSession(sessionId)
  }

  const handleManageSessionSpaces = useCallback(
    (sessionId: string) => {
      openDialog('space-session-link', { sessionId })
    },
    [openDialog],
  )

  const handleDetachSpaceAttempt = useCallback(
    async (attemptId: string, spaceId: string) => {
      await unlinkSpaceAttempt(attemptId, spaceId)
    },
    [unlinkSpaceAttempt],
  )

  const refreshSessionsForSpace = useCallback(
    async (spaceId: string) => {
      const attempts = attemptsBySpaceId[spaceId] ?? []
      const projectIds = [
        ...new Set(
          attempts
            .map((attempt) => sessionLookup.get(attempt.sessionId)?.projectId)
            .filter((id): id is string => id !== null && id !== undefined),
        ),
      ]
      await loadGlobalSessions()
      await loadGlobalChatSessions()
      for (const projectId of projectIds) {
        await loadSessions(projectId)
      }
      await loadRecents()
    },
    [
      attemptsBySpaceId,
      loadGlobalChatSessions,
      loadGlobalSessions,
      loadRecents,
      loadSessions,
      sessionLookup,
    ],
  )

  const handleArchiveSpace = useCallback(
    async (spaceId: string) => {
      const space = spaces.find((entry) => entry.id === spaceId)
      const attempts = attemptsBySpaceId[spaceId] ?? []
      const confirmed = window.confirm(
        `Archive Space "${space?.title ?? 'Space'}"?\n\nThis will hide the Space from the active list and archive ${attempts.length} attached session${attempts.length === 1 ? '' : 's'}.`,
      )
      if (!confirmed) return
      const archived = await archiveSpace(spaceId)
      if (!archived) return
      await refreshSessionsForSpace(spaceId)
    },
    [archiveSpace, attemptsBySpaceId, refreshSessionsForSpace, spaces],
  )

  const handleUnarchiveSpace = useCallback(
    async (spaceId: string) => {
      const unarchived = await unarchiveSpace(spaceId)
      if (!unarchived) return
      await refreshSessionsForSpace(spaceId)
    },
    [refreshSessionsForSpace, unarchiveSpace],
  )

  const handleDeleteGlobalChatSession = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId, null)
      for (const space of spaces) {
        void loadSpaceAttempts(space.id)
      }
    },
    [deleteSession, loadSpaceAttempts, spaces],
  )

  const handleOpenCodeReview = useCallback(() => {
    onSelectSurface('code')
    onOpenCodeReview?.()
  }, [onOpenCodeReview, onSelectSurface])

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

  const handleSyncWorkspaceEnvFiles = async (workspaceId: string) => {
    if (!activeProject) {
      return
    }

    await syncWorkspaceEnvFiles(workspaceId, activeProject.id)
    const error = useWorkspaceStore.getState().error
    if (error) {
      toast.error(error)
      return
    }
    toast.success('Workspace env files synced')
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
    if (onSelectProjectRoot) {
      void onSelectProjectRoot(projectId)
      return
    }

    prepareForProject(projectId)
    await setActiveProject(projectId)
  }

  const hiddenDialogTrigger = () => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="hidden"
      tabIndex={-1}
      aria-hidden="true"
    />
  )

  const dialogHosts = (
    <>
      <SpaceWorkboardDialogContainer trigger={hiddenDialogTrigger()} />
      <ProjectSettingsDialogContainer
        contextSection={(projectId) => (
          <ProjectContextSettings projectId={projectId} />
        )}
        trigger={hiddenDialogTrigger()}
      />
      <ProviderStatusDialogContainer trigger={hiddenDialogTrigger()} />
      <McpServersDialogContainer trigger={hiddenDialogTrigger()} />
      <SkillsBrowserDialogContainer trigger={hiddenDialogTrigger()} />
      <PromptLibraryBrowserDialogContainer trigger={hiddenDialogTrigger()} />
      <ReleaseNotesDialogContainer trigger={hiddenDialogTrigger()} />
    </>
  )

  if (collapsed) {
    return (
      <div className="relative flex h-full w-14 flex-col items-center">
        <div
          className="absolute top-1/2 right-[-11px] z-20 flex h-14 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-white/10 bg-background/90 text-muted-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          role="button"
          tabIndex={0}
          aria-label="Peek sidebar"
          title="Peek sidebar"
          onMouseEnter={onPeek}
          onFocus={onPeek}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
        <div
          className="app-sidebar-topbar h-12 w-full border-b border-white/10"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />

        <div className="flex w-full flex-col items-center gap-1 border-b border-white/10 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title="Expand sidebar"
            aria-label="Expand sidebar"
            onClick={onExpand}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={activeSurface === 'code' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-9 w-9"
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
            className="h-9 w-9"
            title="Chat"
            aria-label="Show chat surface"
            aria-pressed={activeSurface === 'chat'}
            onClick={() => onSelectSurface('chat')}
          >
            <MessageSquareText className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            title={`Needs You (${visibleAttentionSessions.length})`}
            aria-label={`Needs You (${visibleAttentionSessions.length})`}
          >
            <span
              className={cn(
                'h-3 w-3 rounded-full border-2',
                waitingSessions.length > 0
                  ? 'border-warning'
                  : reviewSessions.some(
                        ({ session }) => session.attention === 'failed',
                      )
                    ? 'border-destructive'
                    : 'border-emerald-500',
              )}
            />
            {visibleAttentionSessions.length > 0 ? (
              <span className="absolute -top-1 -right-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
                {visibleAttentionSessions.length}
              </span>
            ) : null}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title={
              activeSurface === 'chat'
                ? 'Convergence Chat'
                : (activeProject?.name ?? 'No project')
            }
            aria-label={
              activeSurface === 'chat'
                ? 'Convergence Chat'
                : (activeProject?.name ?? 'No project')
            }
            onClick={() => onSelectSurface(activeSurface)}
          >
            {activeSurface === 'chat' ? (
              <MessageSquareText className="h-4 w-4" />
            ) : (
              <FolderGit2 className="h-4 w-4" />
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title={activeSurface === 'chat' ? 'New chat' : 'Open a project'}
            aria-label={
              activeSurface === 'chat' ? 'New chat' : 'Open a project'
            }
            onClick={
              activeSurface === 'chat' ? onNewGlobalSession : createProject
            }
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="app-sidebar-footer flex w-full flex-col items-center gap-1 border-t border-white/10 py-3">
          <SidebarToolsMenu
            activeSurface={activeSurface}
            hasActiveProject={!!activeProject}
            iconOnly
            onOpenCodeReview={handleOpenCodeReview}
            onOpenDialog={openDialog}
          />
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

        {dialogHosts}
        {activeSurface === 'code' ? <WorkspaceCreateDialogContainer /> : null}
        <SpaceCreateDialogContainer onCreated={handleSpaceCreated} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="app-sidebar-topbar flex h-12 items-center justify-end border-b border-white/10 px-3"
        style={
          { WebkitAppRegion: peek ? 'no-drag' : 'drag' } as React.CSSProperties
        }
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
          <SidebarToolsMenu
            activeSurface={activeSurface}
            hasActiveProject={!!activeProject}
            iconOnly
            onOpenCodeReview={handleOpenCodeReview}
            onOpenDialog={openDialog}
          />
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

      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex items-center gap-1">
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

        {peek ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Pin sidebar"
            aria-label="Pin sidebar"
            onClick={onPinPeek}
          >
            <Pin className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            onClick={onCollapse}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
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

        <TerminalIdleSection
          notices={terminalIdleNotices}
          onSelect={handleSelectTerminalIdleNotice}
          onDismiss={dismissTerminalIdleNotice}
        />

        {(visibleAttentionSessions.length > 0 ||
          terminalIdleNotices.length > 0) && (
          <div className="mx-3 mb-3 border-t border-border/50" />
        )}

        {activeSurface === 'chat' ? (
          <GlobalChatSessionList
            spaces={chatSpaces}
            sessions={ungroupedGlobalChatSessions}
            activeSessionId={activeGlobalSessionId}
            selectedSpaceId={selectedSpaceId}
            expandedSpaceIds={expandedSpaceIds}
            archivedSpacesExpanded={archivedSpacesExpanded}
            onNewSession={onNewGlobalSession}
            onNewSpace={() => openDialog('space-create')}
            onSelectSpace={onSelectSpace}
            onToggleSpace={toggleSpace}
            onToggleArchivedSpaces={toggleArchivedSpaces}
            onArchiveSpace={handleArchiveSpace}
            onUnarchiveSpace={handleUnarchiveSpace}
            onSelectSpaceAttempt={handleSelectSpaceAttempt}
            onSelectSession={onSelectGlobalSession}
            onManageSessionSpaces={handleManageSessionSpaces}
            onDetachSpaceAttempt={handleDetachSpaceAttempt}
            onArchiveSession={archiveSession}
            onUnarchiveSession={unarchiveSession}
            onDeleteSession={handleDeleteGlobalChatSession}
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
                onSyncWorkspaceEnvFiles={handleSyncWorkspaceEnvFiles}
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
          <Button
            variant="outline"
            size="sm"
            onClick={createProject}
            className="w-full"
          >
            <Plus className="h-4 w-4" />
            Open a project
          </Button>
        ) : null}
      </div>

      {dialogHosts}
      {activeSurface === 'code' ? <WorkspaceCreateDialogContainer /> : null}
      <SpaceCreateDialogContainer onCreated={handleSpaceCreated} />
    </div>
  )
}
