import { useEffect } from 'react'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import { useSessionStore } from '@/entities/session'
import { Toaster, toast } from 'sonner'
import { AppShell } from './App.presentational'

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

  useEffect(() => {
    loadActiveProject()
  }, [loadActiveProject])

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
      <AppShell activeProject={activeProject} loading={loading} />
      <Toaster position="bottom-right" />
    </>
  )
}
