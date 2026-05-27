import { useEffect } from 'react'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import {
  sessionApi,
  useSessionStore,
  type SessionSummary,
} from '@/entities/session'
import { useTerminalStore } from '@/entities/terminal'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useAppSurfaceStore } from '@/entities/app-surface'
import { useCodeReviewStore, type CodeReviewMode } from '@/entities/code-review'
import {
  notificationsApi,
  useNotificationsStore,
} from '@/entities/notifications'
import { updatesApi, useUpdatesStore } from '@/entities/updates'
import { useProviderUpdatesStore } from '@/entities/provider-updates'
import { taskProgressApi, useTaskProgressStore } from '@/entities/task-progress'
import {
  providerDebugApi,
  useProviderDebugStore,
} from '@/entities/provider-debug'
import { Toaster, toast } from 'sonner'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { systemApi } from '@/shared'
import { applyTheme, getStoredTheme } from '@/shared/lib/theme'
import {
  activateProject,
  CommandCenterContainer,
  switchToSession,
} from '@/features/command-center'
import { SpaceSessionLinkDialogContainer } from '@/features/space-session-link'
import { SessionForkDialogContainer } from '@/features/session-fork'
import { SessionIntentDialogContainer } from '@/features/session-intent-dialog'
import { PullRequestReviewStartDialogContainer } from '@/features/pull-request-review-start'
import { NotificationsToastHostContainer } from '@/features/notifications-toast-host'
import { UpdatesToastContainer } from '@/features/updates-toast'
import { ProviderUpdatesToastContainer } from '@/features/provider-updates-toast'
import { FeedbackButtonContainer } from '@/features/feedback-button'
import { AppShell } from './App.layout'

export type MainViewRoute =
  | { kind: 'home' }
  | { kind: 'code-session'; sessionId: string }
  | { kind: 'new-code-session'; workspaceId: string | null }
  | { kind: 'chat-home' }
  | { kind: 'chat-session'; sessionId: string }
  | { kind: 'chat-space'; spaceId: string; draftAttempt: boolean }
  | {
      kind: 'code-review'
      targetId: string | null
      mode: CodeReviewMode
      filePath: string | null
    }

interface AppProps {
  mainViewRoute?: MainViewRoute
  onSelectCodeSession?: (sessionId: string) => void
  onBeginCodeSessionDraft?: (workspaceId: string | null) => void
  onOpenCodeReview?: (search?: {
    targetId?: string | null
    mode?: CodeReviewMode
    file?: string | null
  }) => void
  onCodeReviewSearchChange?: (search: {
    targetId?: string | null
    mode?: CodeReviewMode
    file?: string | null
  }) => void
  onCloseCodeReview?: () => void
  onSelectChatSession?: (sessionId: string) => void
  onSelectChatSpace?: (spaceId: string, options?: { draft?: boolean }) => void
  onBeginChatSpaceAttempt?: (spaceId: string) => void
  onCancelChatSpaceAttempt?: (spaceId: string) => void
  onSelectAnySession?: (session: SessionSummary) => void
  onShowCode?: () => void | Promise<void>
  onShowCodeHome?: () => void | Promise<void>
  onShowChat?: () => void
  onNewGlobalChat?: () => void
}

export function App({
  mainViewRoute = { kind: 'home' },
  onSelectCodeSession,
  onBeginCodeSessionDraft,
  onOpenCodeReview,
  onCodeReviewSearchChange,
  onCloseCodeReview,
  onSelectChatSession,
  onSelectChatSpace,
  onBeginChatSpaceAttempt,
  onCancelChatSpaceAttempt,
  onSelectAnySession,
  onShowCode,
  onShowCodeHome,
  onShowChat,
  onNewGlobalChat,
}: AppProps) {
  const routeCodeSessionId =
    mainViewRoute.kind === 'code-session' ? mainViewRoute.sessionId : null
  const routeNewCodeSessionWorkspaceId =
    mainViewRoute.kind === 'new-code-session' ? mainViewRoute.workspaceId : null
  const routeNewCodeSessionActive = mainViewRoute.kind === 'new-code-session'
  const routeCodeReviewMode =
    mainViewRoute.kind === 'code-review' ? mainViewRoute.mode : null
  const routeCodeReviewFilePath =
    mainViewRoute.kind === 'code-review' ? mainViewRoute.filePath : null
  const routeCodeReviewTargetId =
    mainViewRoute.kind === 'code-review' ? mainViewRoute.targetId : null
  const routeCodeReviewActive = mainViewRoute.kind === 'code-review'
  const routeChatSessionId =
    mainViewRoute.kind === 'chat-session' ? mainViewRoute.sessionId : null
  const routeChatSpaceId =
    mainViewRoute.kind === 'chat-space' ? mainViewRoute.spaceId : null
  const routeChatSpaceDraftAttempt =
    mainViewRoute.kind === 'chat-space' ? mainViewRoute.draftAttempt : false
  const routeChatActive =
    mainViewRoute.kind === 'chat-home' ||
    mainViewRoute.kind === 'chat-session' ||
    mainViewRoute.kind === 'chat-space'
  const loadActiveProject = useProjectStore((s) => s.loadActiveProject)
  const activeProject = useProjectStore((s) => s.activeProject)
  const loading = useProjectStore((s) => s.loading)
  const projectError = useProjectStore((s) => s.error)
  const clearProjectError = useProjectStore((s) => s.clearError)
  const workspaceError = useWorkspaceStore((s) => s.error)
  const clearWorkspaceError = useWorkspaceStore((s) => s.clearError)
  const loadGlobalWorkspaces = useWorkspaceStore((s) => s.loadGlobalWorkspaces)
  const sessionError = useSessionStore((s) => s.error)
  const clearSessionError = useSessionStore((s) => s.clearError)
  const prepareForProject = useSessionStore((s) => s.prepareForProject)
  const beginStoreSessionDraft = useSessionStore((s) => s.beginSessionDraft)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const activeGlobalSessionId = useSessionStore((s) => s.activeGlobalSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const setActiveGlobalSession = useSessionStore(
    (s) => s.setActiveGlobalSession,
  )
  const handleSessionSummaryUpdate = useSessionStore(
    (s) => s.handleSessionSummaryUpdate,
  )
  const handleConversationPatched = useSessionStore(
    (s) => s.handleConversationPatched,
  )
  const handleQueuedInputPatched = useSessionStore(
    (s) => s.handleQueuedInputPatched,
  )
  const loadGlobalSessions = useSessionStore((s) => s.loadGlobalSessions)
  const loadGlobalChatSessions = useSessionStore(
    (s) => s.loadGlobalChatSessions,
  )
  const routeSessionLoaded = useSessionStore((s) =>
    routeCodeSessionId
      ? s.globalSessions.some((session) => session.id === routeCodeSessionId)
      : false,
  )
  const routeChatSessionLoaded = useSessionStore((s) =>
    routeChatSessionId
      ? s.globalChatSessions.some(
          (session) => session.id === routeChatSessionId,
        )
      : false,
  )
  const loadRecents = useSessionStore((s) => s.loadRecents)
  const loadAppSettings = useAppSettingsStore((s) => s.load)
  const loadNotificationPrefs = useNotificationsStore((s) => s.loadPrefs)
  const setActiveSurface = useAppSurfaceStore((s) => s.setActiveSurface)
  const openCodeReview = useCodeReviewStore((s) => s.openReview)
  const closeCodeReview = useCodeReviewStore((s) => s.closeReview)
  const setNotificationActiveSession = useNotificationsStore(
    (s) => s.setActiveSession,
  )
  const loadUpdates = useUpdatesStore((s) => s.loadInitial)
  const loadProviderUpdates = useProviderUpdatesStore((s) => s.loadInitial)
  const stopProviderUpdates = useProviderUpdatesStore(
    (s) => s.stopBackgroundChecks,
  )
  const ingestTaskProgress = useTaskProgressStore((s) => s.ingest)
  const ingestProviderDebug = useProviderDebugStore((s) => s.ingest)

  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

  useEffect(() => {
    const fallbackPlatform = navigator.userAgent.includes('Mac')
      ? 'darwin'
      : 'unknown'
    const systemInfo = systemApi.getInfo() ?? {
      platform: fallbackPlatform,
      prefersReducedTransparency: false,
    }
    const { platform, prefersReducedTransparency } = systemInfo
    document.documentElement.dataset.platform = platform
    document.documentElement.dataset.reducedTransparency = String(
      prefersReducedTransparency,
    )
  }, [])

  useEffect(() => {
    loadActiveProject()
  }, [loadActiveProject])

  useEffect(() => {
    void loadGlobalWorkspaces()
  }, [loadGlobalWorkspaces])

  useEffect(() => {
    void (async () => {
      await loadGlobalSessions()
      await loadGlobalChatSessions()
      await loadRecents()
    })()
  }, [loadGlobalSessions, loadGlobalChatSessions, loadRecents])

  useEffect(() => {
    void loadAppSettings()
  }, [loadAppSettings])

  useEffect(() => {
    void loadNotificationPrefs()
  }, [loadNotificationPrefs])

  useEffect(() => {
    void loadUpdates()
  }, [loadUpdates])

  useEffect(() => {
    void loadProviderUpdates()
    return () => stopProviderUpdates()
  }, [loadProviderUpdates, stopProviderUpdates])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    return updatesApi.onStatusChanged((status) => {
      console.debug('[updates:status]', status)
    })
  }, [])

  useEffect(() => {
    void setNotificationActiveSession(activeSessionId)
  }, [activeSessionId, setNotificationActiveSession])

  useEffect(() => {
    if (!routeCodeSessionId) return
    setActiveSurface('code')
    closeCodeReview()

    if (!routeSessionLoaded) return
    if (activeSessionId === routeCodeSessionId) return

    void switchToSession(routeCodeSessionId)
  }, [
    activeSessionId,
    routeCodeSessionId,
    routeSessionLoaded,
    closeCodeReview,
    setActiveSurface,
  ])

  useEffect(() => {
    if (!routeChatActive) return

    closeCodeReview()
    setActiveSurface('chat')

    if (!routeChatSessionId) {
      if (activeGlobalSessionId !== null) {
        setActiveGlobalSession(null)
      }
      return
    }

    if (!routeChatSessionLoaded) return
    if (activeGlobalSessionId === routeChatSessionId) return
    setActiveGlobalSession(routeChatSessionId)
  }, [
    activeGlobalSessionId,
    closeCodeReview,
    routeChatActive,
    routeChatSessionId,
    routeChatSessionLoaded,
    setActiveGlobalSession,
    setActiveSurface,
  ])

  useEffect(() => {
    if (routeCodeReviewActive) {
      setActiveSurface('code')
      openCodeReview({
        mode: routeCodeReviewMode ?? 'working-tree',
        selectedFile: routeCodeReviewFilePath,
      })
      return
    }

    if (routeCodeSessionId) {
      closeCodeReview()
    }
  }, [
    closeCodeReview,
    openCodeReview,
    routeCodeReviewActive,
    routeCodeReviewFilePath,
    routeCodeReviewMode,
    routeCodeSessionId,
    setActiveSurface,
  ])

  useEffect(() => {
    if (!routeNewCodeSessionActive) return

    closeCodeReview()
    setActiveSurface('code')
    beginStoreSessionDraft(routeNewCodeSessionWorkspaceId)
  }, [
    beginStoreSessionDraft,
    closeCodeReview,
    routeNewCodeSessionActive,
    routeNewCodeSessionWorkspaceId,
    setActiveSurface,
  ])

  useEffect(() => {
    // Drain pending terminal-layout debounced saves on window close so a
    // quit within the save debounce window still persists the last
    // mutation. Best-effort; the call fires-and-forgets a synchronous
    // IPC invoke, which is the closest we can get inside beforeunload.
    const handler = () => {
      void useTerminalStore.getState().flushPersistedSaves()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    const unsubscribe = taskProgressApi.subscribe((event) => {
      if (import.meta.env.DEV) {
        console.debug('[task-progress]', event)
      }
      ingestTaskProgress(event)
    })
    return unsubscribe
  }, [ingestTaskProgress])

  useEffect(() => {
    const unsubscribe = providerDebugApi.subscribe((entry) => {
      ingestProviderDebug(entry)
    })
    return unsubscribe
  }, [ingestProviderDebug])

  useEffect(() => {
    const unsubscribeSummary = sessionApi.onSessionSummaryUpdate((summary) => {
      handleSessionSummaryUpdate(summary)
    })
    const unsubscribeConversation = sessionApi.onSessionConversationPatched(
      (event) => {
        handleConversationPatched(event)
      },
    )
    const unsubscribeQueuedInput = sessionApi.onSessionQueuedInputPatched(
      (event) => {
        handleQueuedInputPatched(event)
      },
    )

    return () => {
      unsubscribeSummary()
      unsubscribeConversation()
      unsubscribeQueuedInput()
    }
  }, [
    handleSessionSummaryUpdate,
    handleConversationPatched,
    handleQueuedInputPatched,
  ])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const unsubToast = notificationsApi.onShowToast((payload) => {
      console.debug('[notifications:show-toast]', payload)
    })
    const unsubSound = notificationsApi.onPlaySound((payload) => {
      console.debug('[notifications:play-sound]', payload)
    })
    return () => {
      unsubToast()
      unsubSound()
    }
  }, [])

  useEffect(() => {
    if (projectError) {
      toast.error(projectError)
      clearProjectError()
    }
  }, [projectError, clearProjectError])

  useEffect(() => {
    if (workspaceError) {
      toast.error(workspaceError)
      clearWorkspaceError()
    }
  }, [workspaceError, clearWorkspaceError])

  useEffect(() => {
    if (sessionError) {
      toast.error(sessionError)
      clearSessionError()
    }
  }, [sessionError, clearSessionError])

  const handleOpenCodeReview = (
    search?: Parameters<NonNullable<AppProps['onOpenCodeReview']>>[0],
  ) => {
    if (onOpenCodeReview) {
      onOpenCodeReview(search)
      return
    }

    openCodeReview({
      mode: search?.mode,
      selectedFile: search?.file,
    })
  }

  const handleSelectProjectRoot = async (projectId: string) => {
    setActiveSurface('code')
    prepareForProject(projectId)
    await onShowCodeHome?.()
    await activateProject(projectId)
  }

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell
        activeSessionId={activeSessionId}
        activeGlobalSessionId={activeGlobalSessionId}
        onSelectSession={onSelectCodeSession ?? setActiveSession}
        onSelectGlobalSession={setActiveGlobalSession}
        onOpenCodeReview={handleOpenCodeReview}
        onCodeReviewSearchChange={onCodeReviewSearchChange}
        onCloseCodeReview={onCloseCodeReview ?? closeCodeReview}
        codeReviewActive={routeCodeReviewActive}
        codeReviewTargetId={routeCodeReviewTargetId}
        codeReviewMode={routeCodeReviewMode ?? 'working-tree'}
        codeReviewFilePath={routeCodeReviewFilePath}
        selectedChatSpaceId={routeChatSpaceId}
        draftChatSpaceId={routeChatSpaceDraftAttempt ? routeChatSpaceId : null}
        onSelectChatSession={onSelectChatSession ?? setActiveGlobalSession}
        onSelectChatSpace={onSelectChatSpace}
        onBeginChatSpaceAttempt={onBeginChatSpaceAttempt}
        onCancelChatSpaceAttempt={onCancelChatSpaceAttempt}
        onSelectAnySession={onSelectAnySession}
        onShowCode={onShowCode}
        onSelectProjectRoot={handleSelectProjectRoot}
        onShowChat={onShowChat}
        onNewGlobalChat={onNewGlobalChat}
        loading={loading}
        hasProject={!!activeProject}
        showDevelopmentRibbon={import.meta.env.DEV}
      />
      <CommandCenterContainer
        onSelectCodeSession={onSelectCodeSession}
        onSelectChatSession={onSelectChatSession}
        onBeginCodeSessionDraft={onBeginCodeSessionDraft}
        onSelectProject={handleSelectProjectRoot}
        onOpenCodeReview={() => handleOpenCodeReview()}
      />
      <SpaceSessionLinkDialogContainer />
      <SessionForkDialogContainer />
      <SessionIntentDialogContainer
        onBeginCodeSessionDraft={onBeginCodeSessionDraft}
        onSelectCodeSession={onSelectCodeSession}
      />
      <PullRequestReviewStartDialogContainer />
      <NotificationsToastHostContainer onFocusSession={onSelectAnySession} />
      <UpdatesToastContainer />
      <ProviderUpdatesToastContainer />
      <FeedbackButtonContainer />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
