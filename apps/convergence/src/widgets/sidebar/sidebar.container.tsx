import { PerfProfiler } from '@/shared/lib/perf-profiler'
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
import { useNotificationsStore } from '@/entities/notifications'
import { useTaskProgressStore } from '@/entities/task-progress'
import {
  AppSettingsDialogContainer,
  SpaceWorkboardDialogContainer,
  McpServersDialogContainer,
  ProjectContextSettings,
  ProjectCreateDialogContainer,
  ProjectSettingsDialogContainer,
  PromptLibraryBrowserDialogContainer,
  ProviderStatusDialogContainer,
  ReleaseNotesDialogContainer,
  SkillsBrowserDialogContainer,
  SpaceCreateDialogContainer,
  ThemeToggleButton,
  WorkspaceCreateDialogContainer,
  LaneCreateDialogContainer,
} from '@/features'
import { switchToSession } from '@/features/command-center'
import { useDialogStore } from '@/entities/dialog'
import { useAppSettingsStore } from '@/entities/app-settings'
import { groupNeedsYou, needsYouCardModel } from '@/features/needs-you'
import {
  Badge,
  Button,
  cn,
  DragRegion,
  IconButton,
  ScreenHeader,
  useConfirm,
} from '@convergence/ui'
import type { AppSurface } from '@/shared/types/app-surface.types'
import {
  BarChart3,
  ChevronRight,
  FolderGit2,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
  Settings,
} from 'lucide-react'
import { type ChatSidebarSpace } from './global-chat-session-list.presentational'
import { SidebarConversations } from './sidebar-conversations.container'
import { SidebarToolsMenu } from './sidebar-tools-menu.presentational'
import { SurfaceSwitcher } from './surface-switcher.presentational'
import { peekHandleClass, railMarkRing } from './sidebar.styles'
import { toast } from 'sonner'
import { useSidebarSearchShortcut } from './sidebar-search.container'
import { useFeedClock } from './use-feed-clock'
import { sidebarCards } from './sidebar-sessions.pure'
import {
  latestSessionSummary,
  useSidebarSessionLists,
} from './use-sidebar-sessions'
import { useStableCallback } from './use-stable-callback'

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
  onSelectProjectRoot?: (projectId: string) => void | Promise<void>
  onSelectAnySession?: (session: SessionSummary) => void
  onShowMissionControl?: () => void
  missionControlActive?: boolean
  collapsed: boolean
  peek: boolean
  onCollapse: () => void
  onExpand: () => void
  onPeek: () => void
  onPinPeek: () => void
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
  onSelectProjectRoot,
  onSelectAnySession,
  onShowMissionControl,
  missionControlActive = false,
  collapsed,
  peek,
  onCollapse,
  onExpand,
  onPeek,
  onPinPeek,
}) => {
  const [searchRequest, setSearchRequest] = useState(0)
  const requestSearch = useCallback(() => setSearchRequest((n) => n + 1), [])
  useSidebarSearchShortcut({
    collapsed,
    expand: onExpand,
    onRequest: requestSearch,
  })
  const projects = useProjectStore((s) => s.projects)
  const activeProject = useProjectStore((s) => s.activeProject)
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
  const openProjectDialog = useCallback(
    () => openDialog('project-create'),
    [openDialog],
  )
  const needsYouDismissals = useSessionStore((s) => s.needsYouDismissals)
  const [cardNow, setCardNow] = useState(() => Date.now())
  // The lists are held against summaries that change nothing shown at once
  // (MAR-3378 F1b); the clock's tick and a dismissal change release them.
  const listRefresh = useMemo(
    () => ({ cardNow, needsYouDismissals }),
    [cardNow, needsYouDismissals],
  )
  const { sessions, globalSessions, globalChatSessions } =
    useSidebarSessionLists(listRefresh)
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

  const endpoints = useAppSettingsStore(
    (s) => s.settings.executionHostEndpoints,
  )
  const setPinned = useSessionStore((s) => s.setPinned)
  // The one card derivation (MAR-3378 F1b R2). The collapsed rail and the
  // feed both read it; the feed narrows it by name search and builds none.
  const cards = useMemo(
    () =>
      sidebarCards(globalSessions, {
        projects,
        endpoints,
        now: cardNow,
        dismissals: needsYouDismissals,
      }),
    [globalSessions, projects, endpoints, cardNow, needsYouDismissals],
  )
  const cardGroups = useMemo(() => groupNeedsYou(cards), [cards])

  const selectedProjectSession =
    activeSurface === 'code'
      ? sessions.find(
          (session) =>
            session.id === activeSessionId && session.providerId !== 'shell',
        )
      : undefined
  const selectedProjectCard = selectedProjectSession
    ? needsYouCardModel(selectedProjectSession, {
        projectName: activeProject?.name ?? 'Unknown project',
        endpoints,
        now: cardNow,
      })
    : null

  // Keyed on presence, not on `cardGroups` itself: the array is rebuilt on
  // every tick, so depending on it would restart the interval each minute.
  // Any listed conversation keeps it running (MAR-3378 F1b): the tick is also
  // what releases the held lists, and a project-tree row says "Last moved"
  // even when the feed is empty.
  useFeedClock(
    cardGroups.length > 0 ||
      selectedProjectCard !== null ||
      globalSessions.length > 0 ||
      sessions.length > 0,
    setCardNow,
    cardGroups.some((group) => group.cards.some((card) => card.timing.live)) ||
      Boolean(selectedProjectCard?.timing.live),
  )

  const attentionCards = cardGroups
    .flatMap((group) => group.cards)
    .filter((card) => !card.dismissed && card.attentionGroup)

  const handleSelectNeedsYouSession = useStableCallback(
    async (sessionId: string) => {
      const target = useSessionStore
        .getState()
        .globalSessions.find((session) => session.id === sessionId)
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
    },
  )

  const handleSelectTerminalIdleNotice = useStableCallback(
    async (notice: TerminalIdleNotice) => {
      const target = latestSessionSummary(notice.sessionId)
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
    },
  )

  // Every question this sidebar asks before something it can't take back,
  // in the app's own dialog (R5).
  const confirm = useConfirm()
  /** "3 attached sessions", for a question about a Space or a workspace. */
  const attachedSessions = (count: number) =>
    `${count} attached session${count === 1 ? '' : 's'}`

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

  const handleSelectSpaceAttempt = useStableCallback(
    async (sessionId: string) => {
      const target = latestSessionSummary(sessionId)
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
    },
  )

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
      const confirmed = await confirm({
        title: `Archive “${space?.title ?? 'Space'}”?`,
        description: `It leaves the active list, and its ${attachedSessions(attempts.length)} are archived with it. You can unarchive it later.`,
        confirmLabel: 'Archive Space',
      })
      if (!confirmed) return
      const archived = await archiveSpace(spaceId)
      if (!archived) return
      await refreshSessionsForSpace(spaceId)
    },
    [archiveSpace, attemptsBySpaceId, confirm, refreshSessionsForSpace, spaces],
  )

  const handleUnarchiveSpace = useCallback(
    async (spaceId: string) => {
      const unarchived = await unarchiveSpace(spaceId)
      if (!unarchived) return
      await refreshSessionsForSpace(spaceId)
    },
    [refreshSessionsForSpace, unarchiveSpace],
  )

  /**
   * Deleting a conversation can't be undone, so it asks first (R5, a
   * decided change: it used to go on one click).
   */
  const confirmDeleteSession = useCallback(
    (sessionId: string) =>
      confirm({
        title: `Delete “${sessionLookup.get(sessionId)?.name ?? 'this session'}”?`,
        description:
          'Its conversation and its history are deleted for good. Files it changed stay as they are.',
        confirmLabel: 'Delete session',
        variant: 'danger',
      }),
    [confirm, sessionLookup],
  )

  const handleDeleteGlobalChatSession = useCallback(
    async (sessionId: string) => {
      if (!(await confirmDeleteSession(sessionId))) return
      await deleteSession(sessionId, null)
      for (const space of spaces) {
        void loadSpaceAttempts(space.id)
      }
    },
    [confirmDeleteSession, deleteSession, loadSpaceAttempts, spaces],
  )

  const handleArchiveWorkspace = useStableCallback(
    async (workspaceId: string) => {
      if (!activeProject) {
        return
      }

      const workspace = workspaces.find((entry) => entry.id === workspaceId)
      const branchName = workspace?.branchName ?? 'workspace'
      const confirmed = await confirm({
        title: `Archive workspace “${branchName}”?`,
        description:
          'It leaves the sidebar, and every session inside it is archived. Their conversations are kept.',
        confirmLabel: 'Archive workspace',
      })
      if (!confirmed) return

      const pullRequest = pullRequestsByWorkspaceId[workspaceId]
      const removeWorktree =
        pullRequest?.state === 'merged'
          ? await confirm({
              title: 'Also remove its worktree from disk?',
              description: `The pull request for “${branchName}” is merged. Removing the worktree deletes its folder; the workspace stays archived either way.`,
              confirmLabel: 'Remove worktree',
              cancelLabel: 'Keep worktree',
              variant: 'danger',
            })
          : false

      await archiveWorkspace(workspaceId, activeProject.id, removeWorktree)
      await loadSessions(activeProject.id)
      await loadGlobalSessions()
      await loadRecents()
    },
  )

  const handleUnarchiveWorkspace = useStableCallback(
    async (workspaceId: string) => {
      if (!activeProject) {
        return
      }

      await unarchiveWorkspace(workspaceId, activeProject.id)
      await loadSessions(activeProject.id)
      await loadGlobalSessions()
      await loadRecents()
    },
  )

  const handleRemoveWorkspaceWorktree = useStableCallback(
    async (workspaceId: string) => {
      if (!activeProject) {
        return
      }

      const workspace = workspaces.find((entry) => entry.id === workspaceId)
      const branchName = workspace?.branchName ?? 'workspace'
      const confirmed = await confirm({
        title: `Remove the worktree for “${branchName}” from disk?`,
        description:
          'The workspace and its conversations are kept, but it can’t take new agent work until worktrees can be restored.',
        confirmLabel: 'Remove worktree',
        variant: 'danger',
      })
      if (!confirmed) return

      await removeWorkspaceWorktree(workspaceId, activeProject.id)
    },
  )

  const handleSyncWorkspaceEnvFiles = useStableCallback(
    async (workspaceId: string) => {
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
    },
  )

  const handleDeleteWorkspace = useStableCallback(
    async (workspaceId: string) => {
      if (!activeProject) {
        return
      }

      const workspace = workspaces.find((entry) => entry.id === workspaceId)
      const branchName = workspace?.branchName ?? 'workspace'
      const confirmed = await confirm({
        title: `Delete workspace “${branchName}”?`,
        description:
          'The workspace and every session and conversation inside it are deleted for good.',
        confirmLabel: 'Delete workspace',
        variant: 'danger',
      })
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
    },
  )

  const handleSelectProject = useStableCallback(async (projectId: string) => {
    if (onSelectProjectRoot) {
      void onSelectProjectRoot(projectId)
      return
    }

    prepareForProject(projectId)
    await setActiveProject(projectId)
  })

  const handlePin = useStableCallback((id: string, pinned: boolean) => {
    void setPinned(id, pinned).catch((error) =>
      toast.error(error instanceof Error ? error.message : String(error)),
    )
  })
  const handleNewGlobalSession = useStableCallback(() => onNewGlobalSession())
  const handleNewSpace = useStableCallback(() => openDialog('space-create'))
  const handleSelectSpace = useStableCallback((id: string) => onSelectSpace(id))
  const handleSelectGlobalSession = useStableCallback((id: string) =>
    onSelectGlobalSession(id),
  )
  const handleSelectSession = useStableCallback((id: string) =>
    onSelectSession(id),
  )
  const handleDeleteSession = useStableCallback(async (sessionId: string) => {
    if (!activeProject) return
    const projectId = activeProject.id
    if (!(await confirmDeleteSession(sessionId))) return
    void deleteSession(sessionId, projectId)
  })
  const handleRenameSession = useStableCallback(
    (sessionId: string, name: string) =>
      void sessionApi.rename(sessionId, name).catch(() => undefined),
  )
  const handleOpenCreateWorkspace = useStableCallback(() =>
    openDialog('workspace-create'),
  )
  const activeProjectName = activeProject?.name ?? 'Project'
  const cardContext = useMemo(
    () => ({ projectName: activeProjectName, endpoints, now: cardNow }),
    [activeProjectName, endpoints, cardNow],
  )

  // Memoized so the SidebarConversations boundary can skip a parent render
  // that changed nothing it shows (MAR-3378 F1b).
  const selectSurface = useStableCallback((surface: AppSurface) =>
    onSelectSurface(surface),
  )
  const hasMissionControl = Boolean(onShowMissionControl)
  const showMissionControl = useStableCallback(() => onShowMissionControl?.())
  const pinPeek = useStableCallback(() => onPinPeek())
  const collapse = useStableCallback(() => onCollapse())
  const headerStart = useMemo(
    () => (
      <SurfaceSwitcher
        placement="row"
        activeSurface={activeSurface}
        missionControlActive={missionControlActive}
        onSelectSurface={selectSurface}
        onShowMissionControl={
          hasMissionControl ? showMissionControl : undefined
        }
      />
    ),
    [
      activeSurface,
      hasMissionControl,
      missionControlActive,
      selectSurface,
      showMissionControl,
    ],
  )
  const headerEnd = useMemo(
    () =>
      peek ? (
        <IconButton
          label="Pin sidebar"
          type="button"
          variant="ghost"
          onClick={pinPeek}
          tooltipSide="bottom"
          size="sm"
        >
          <Pin className="h-4 w-4" />
        </IconButton>
      ) : (
        <IconButton
          label="Collapse sidebar"
          type="button"
          variant="ghost"
          onClick={collapse}
          tooltipSide="bottom"
          size="sm"
        >
          <PanelLeftClose className="h-4 w-4" />
        </IconButton>
      ),
    [peek, pinPeek, collapse],
  )

  const hiddenDialogTrigger = () => (
    <Button
      type="button"
      variant="ghost"
      tabIndex={-1}
      aria-hidden="true"
      className="hidden"
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
      <AppSettingsDialogContainer trigger={hiddenDialogTrigger()} />
      <ProjectCreateDialogContainer />
      <LaneCreateDialogContainer />
    </>
  )

  // R3: 28 px in the header, the rail's one size (32) on the rail (NAV-6).
  const settingsGear = (side: 'right' | 'bottom') => (
    <IconButton
      label="Open settings"
      variant="ghost"
      onClick={() => openDialog('app-settings')}
      tooltipSide={side}
      size={side === 'bottom' ? 'sm' : 'md'}
    >
      <Settings className="h-4 w-4" />
    </IconButton>
  )

  if (collapsed) {
    // R1: the loudest card waiting decides the rail's tone, and its count
    // wears the same one (no red count beside a green ring).
    const railTone = attentionCards.some(
      (card) => card.attentionGroup === 'Waiting on you',
    )
      ? 'warning'
      : attentionCards.some(({ session }) => session.attention === 'failed')
        ? 'danger'
        : 'success'
    return (
      <div className="relative flex h-full w-14 flex-col items-center">
        {/* The rail's edge: hover, focus or a press opens the sidebar over the content (NAV-27). */}
        <IconButton
          label="Peek sidebar"
          tooltipSide="right"
          type="button"
          variant="ghost"
          className={peekHandleClass}
          onMouseEnter={onPeek}
          onFocus={onPeek}
          onClick={onPeek}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </IconButton>
        {/* The window still moves from the rail's top (NAV-4). */}
        <DragRegion className="app-sidebar-topbar border-b border-line" />

        <div className="flex w-full flex-col items-center gap-1 border-b border-hairline py-3">
          <IconButton
            label="Expand sidebar"
            type="button"
            variant="ghost"
            onClick={onExpand}
            tooltipSide="right"
            size="md"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </IconButton>

          <SurfaceSwitcher
            placement="rail"
            activeSurface={activeSurface}
            missionControlActive={missionControlActive}
            onSelectSurface={onSelectSurface}
            onShowMissionControl={onShowMissionControl}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 py-3">
          {/* Opens the sidebar over the content, where the Activity feed is (NAV-17). */}
          <IconButton
            label={`Needs You (${attentionCards.length})`}
            type="button"
            variant="ghost"
            tooltipSide="right"
            size="md"
            className="relative"
            onClick={onPeek}
          >
            <span
              data-tone={railTone}
              className={cn(
                'size-3 rounded-full border-2',
                railMarkRing[railTone],
              )}
            />
            {attentionCards.length > 0 ? (
              <Badge
                shape="count"
                tone={railTone}
                className="absolute -top-1 -right-1"
              >
                {attentionCards.length}
              </Badge>
            ) : null}
          </IconButton>

          <IconButton
            label={
              activeSurface === 'chat'
                ? 'Convergence Chat'
                : (activeProject?.name ?? 'No project')
            }
            type="button"
            variant="ghost"
            onClick={() => onSelectSurface(activeSurface)}
            tooltipSide="right"
            size="md"
          >
            {activeSurface === 'chat' ? (
              <MessageSquareText className="h-4 w-4" />
            ) : (
              <FolderGit2 className="h-4 w-4" />
            )}
          </IconButton>

          <IconButton
            label={activeSurface === 'chat' ? 'New chat' : 'Open a project'}
            type="button"
            variant="ghost"
            onClick={
              activeSurface === 'chat' ? onNewGlobalSession : openProjectDialog
            }
            tooltipSide="right"
            size="md"
          >
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="app-sidebar-footer flex w-full flex-col items-center gap-1 border-t border-hairline py-3">
          <SidebarToolsMenu
            activeSurface={activeSurface}
            hasActiveProject={!!activeProject}
            tooltipSide="right"
            onOpenDialog={openDialog}
          />
          {settingsGear('right')}
          <ThemeToggleButton tooltipSide="right" />
        </div>

        {dialogHosts}
        {activeSurface === 'code' ? <WorkspaceCreateDialogContainer /> : null}
        <SpaceCreateDialogContainer onCreated={handleSpaceCreated} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* The sidebar's strip: it drags the window, except over the content
          while peeking, and every control in it keeps its click (NAV-4). */}
      <ScreenHeader
        drag={!peek}
        className="app-sidebar-topbar px-3"
        end={
          <>
            <IconButton
              label="Open insights"
              variant="ghost"
              onClick={() =>
                openDialog('app-settings', { appSettingsSection: 'insights' })
              }
              tooltipSide="bottom"
              size="sm"
            >
              <BarChart3 className="h-4 w-4" />
            </IconButton>

            <SidebarToolsMenu
              activeSurface={activeSurface}
              hasActiveProject={!!activeProject}
              onOpenDialog={openDialog}
              size="sm"
            />
            {settingsGear('bottom')}
            <ThemeToggleButton tooltipSide="bottom" size="sm" />
          </>
        }
      />

      <PerfProfiler id="sidebar">
        <SidebarConversations
          searchRequest={searchRequest}
          collapsed={collapsed}
          globalSessions={globalSessions}
          sessions={sessions}
          headerStart={headerStart}
          headerEnd={headerEnd}
          projects={projects}
          activeProject={activeProject}
          cards={cards}
          activeSurface={activeSurface}
          activeSessionId={activeSessionId}
          activeGlobalSessionId={activeGlobalSessionId}
          pulsingSessionIds={pulsingSessionIds}
          terminalIdleNotices={terminalIdleNotices}
          onPin={handlePin}
          onSelectNeedsYou={handleSelectNeedsYouSession}
          onDismissNeedsYou={dismissNeedsYouSession}
          onArchiveSession={archiveSession}
          onSelectTerminalIdle={handleSelectTerminalIdleNotice}
          onDismissTerminalIdle={dismissTerminalIdleNotice}
          chatSpaces={chatSpaces}
          ungroupedGlobalChatSessions={ungroupedGlobalChatSessions}
          selectedSpaceId={selectedSpaceId}
          expandedSpaceIds={expandedSpaceIds}
          archivedSpacesExpanded={archivedSpacesExpanded}
          onNewGlobalSession={handleNewGlobalSession}
          onNewSpace={handleNewSpace}
          onSelectSpace={handleSelectSpace}
          onToggleSpace={toggleSpace}
          onToggleArchivedSpaces={toggleArchivedSpaces}
          onArchiveSpace={handleArchiveSpace}
          onUnarchiveSpace={handleUnarchiveSpace}
          onSelectSpaceAttempt={handleSelectSpaceAttempt}
          onSelectGlobalSession={handleSelectGlobalSession}
          onManageSessionSpaces={handleManageSessionSpaces}
          onDetachSpaceAttempt={handleDetachSpaceAttempt}
          onUnarchiveSession={unarchiveSession}
          onDeleteGlobalChatSession={handleDeleteGlobalChatSession}
          onSelectProject={handleSelectProject}
          onCreateProject={openProjectDialog}
          cardContext={cardContext}
          baseBranchName={currentBranch}
          workspaces={workspaces}
          pullRequestsByWorkspaceId={pullRequestsByWorkspaceId}
          expandedWorkspaces={expandedWorkspaces}
          onToggleWorkspace={toggleWorkspace}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          regeneratingSessionIds={regeneratingSessionIds}
          onRegenerateSessionName={handleRegenerateSessionName}
          onArchiveWorkspace={handleArchiveWorkspace}
          onUnarchiveWorkspace={handleUnarchiveWorkspace}
          onRemoveWorkspaceWorktree={handleRemoveWorkspaceWorktree}
          onSyncWorkspaceEnvFiles={handleSyncWorkspaceEnvFiles}
          onDeleteWorkspace={handleDeleteWorkspace}
          onOpenCreateWorkspace={handleOpenCreateWorkspace}
        />
      </PerfProfiler>

      {/* Only the code surface has a footer: chat's was an empty bar (NAV-29). */}
      {activeSurface === 'code' ? (
        <div className="app-sidebar-footer border-t border-hairline p-3">
          <Button
            variant="secondary"
            onClick={openProjectDialog}
            className="w-full"
          >
            <Plus className="h-4 w-4" />
            Open a project
          </Button>
        </div>
      ) : null}

      {dialogHosts}
      {activeSurface === 'code' ? <WorkspaceCreateDialogContainer /> : null}
      <SpaceCreateDialogContainer onCreated={handleSpaceCreated} />
    </div>
  )
}
