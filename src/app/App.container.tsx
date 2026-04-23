import { useEffect } from 'react'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { sessionApi, useSessionStore } from '@/entities/session'
import { useTerminalStore } from '@/entities/terminal'
import { useAppSettingsStore } from '@/entities/app-settings'
import {
  notificationsApi,
  useNotificationsStore,
} from '@/entities/notifications'
import { useUpdatesStore } from '@/entities/updates'
import { useTaskProgressStore } from '@/entities/task-progress'
import { Toaster, toast } from 'sonner'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { applyTheme, getStoredTheme } from '@/shared/lib/theme'
import { CommandCenterContainer } from '@/features/command-center'
import { SessionForkDialogContainer } from '@/features/session-fork'
import { SessionIntentDialogContainer } from '@/features/session-intent-dialog'
import { TerminalSessionCreateDialogContainer } from '@/features/terminal-session-create'
import { NotificationsToastHostContainer } from '@/features/notifications-toast-host'
import { UpdatesToastContainer } from '@/features/updates-toast'
import { FeedbackButtonContainer } from '@/features/feedback-button'
import { AppShell } from './App.layout'

export function App() {
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
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const handleSessionSummaryUpdate = useSessionStore(
    (s) => s.handleSessionSummaryUpdate,
  )
  const handleConversationPatched = useSessionStore(
    (s) => s.handleConversationPatched,
  )
  const loadGlobalSessions = useSessionStore((s) => s.loadGlobalSessions)
  const loadRecents = useSessionStore((s) => s.loadRecents)
  const loadAppSettings = useAppSettingsStore((s) => s.load)
  const loadNotificationPrefs = useNotificationsStore((s) => s.loadPrefs)
  const setNotificationActiveSession = useNotificationsStore(
    (s) => s.setActiveSession,
  )
  const loadUpdates = useUpdatesStore((s) => s.loadInitial)
  const ingestTaskProgress = useTaskProgressStore((s) => s.ingest)

  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

  useEffect(() => {
    const fallbackPlatform = navigator.userAgent.includes('Mac')
      ? 'darwin'
      : 'unknown'
    const systemInfo = window.electronAPI.system?.getInfo?.() ?? {
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
      await loadRecents()
    })()
  }, [loadGlobalSessions, loadRecents])

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
    if (!import.meta.env.DEV) return
    const api = window.electronAPI.updates
    if (!api?.onStatusChanged) return
    return api.onStatusChanged((status) => {
      console.debug('[updates:status]', status)
    })
  }, [])

  useEffect(() => {
    void setNotificationActiveSession(activeSessionId)
  }, [activeSessionId, setNotificationActiveSession])

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
    const subscribe = window.electronAPI.taskProgress?.subscribe
    if (!subscribe) return
    const unsubscribe = subscribe((event) => {
      if (import.meta.env.DEV) {
        console.debug('[task-progress]', event)
      }
      ingestTaskProgress(event)
    })
    return unsubscribe
  }, [ingestTaskProgress])

  useEffect(() => {
    const unsubscribeSummary = sessionApi.onSessionSummaryUpdate((summary) => {
      handleSessionSummaryUpdate(summary)
    })
    const unsubscribeConversation = sessionApi.onSessionConversationPatched(
      (event) => {
        handleConversationPatched(event)
      },
    )

    return () => {
      unsubscribeSummary()
      unsubscribeConversation()
    }
  }, [handleSessionSummaryUpdate, handleConversationPatched])

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

  return (
    <TooltipProvider delayDuration={1500}>
      <AppShell
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSession}
        loading={loading}
        hasProject={!!activeProject}
      />
      <CommandCenterContainer />
      <SessionForkDialogContainer />
      <SessionIntentDialogContainer />
      <TerminalSessionCreateDialogContainer />
      <NotificationsToastHostContainer />
      <UpdatesToastContainer />
      <FeedbackButtonContainer />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
