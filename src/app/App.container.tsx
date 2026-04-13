import { useEffect } from 'react'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSessionStore } from '@/entities/session'
import { Toaster, toast } from 'sonner'
import { applyTheme, getStoredTheme } from '@/shared/lib/theme'
import { AppShell } from './App.layout'

export function App() {
  const loadActiveProject = useProjectStore((s) => s.loadActiveProject)
  const activeProject = useProjectStore((s) => s.activeProject)
  const loading = useProjectStore((s) => s.loading)
  const projectError = useProjectStore((s) => s.error)
  const clearProjectError = useProjectStore((s) => s.clearError)
  const workspaceError = useWorkspaceStore((s) => s.error)
  const clearWorkspaceError = useWorkspaceStore((s) => s.clearError)
  const sessionError = useSessionStore((s) => s.error)
  const clearSessionError = useSessionStore((s) => s.clearError)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const handleSessionUpdate = useSessionStore((s) => s.handleSessionUpdate)

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
    <>
      <AppShell
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSession}
        loading={loading}
        hasProject={!!activeProject}
      />
      <Toaster position="bottom-right" />
    </>
  )
}
