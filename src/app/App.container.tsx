import { useEffect } from 'react'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSessionStore } from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useTaskProgressStore } from '@/entities/task-progress'
import { Toaster, toast } from 'sonner'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { applyTheme, getStoredTheme } from '@/shared/lib/theme'
import { CommandCenterContainer } from '@/features/command-center'
import { SessionForkDialogContainer } from '@/features/session-fork'
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
  const handleSessionUpdate = useSessionStore((s) => s.handleSessionUpdate)
  const loadGlobalSessions = useSessionStore((s) => s.loadGlobalSessions)
  const loadRecents = useSessionStore((s) => s.loadRecents)
  const loadAppSettings = useAppSettingsStore((s) => s.load)
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
    const unsubscribe = window.electronAPI.session.onSessionUpdate(
      (session) => {
        handleSessionUpdate(session)
      },
    )
    return unsubscribe
  }, [handleSessionUpdate])

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
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
