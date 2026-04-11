import { useEffect } from 'react'
import { useProjectStore } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
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

  return (
    <>
      <AppShell activeProject={activeProject} loading={loading} />
      <Toaster position="bottom-right" />
    </>
  )
}
