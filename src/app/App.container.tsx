import { useEffect } from 'react'
import { useProjectStore } from '@/entities/project'
import { Toaster, toast } from 'sonner'
import { AppShell } from './App.presentational'

export function App() {
  const loadActiveProject = useProjectStore((s) => s.loadActiveProject)
  const activeProject = useProjectStore((s) => s.activeProject)
  const loading = useProjectStore((s) => s.loading)
  const error = useProjectStore((s) => s.error)
  const clearError = useProjectStore((s) => s.clearError)

  useEffect(() => {
    loadActiveProject()
  }, [loadActiveProject])

  useEffect(() => {
    if (error) {
      toast.error(error)
      clearError()
    }
  }, [error, clearError])

  return (
    <>
      <AppShell activeProject={activeProject} loading={loading} />
      <Toaster position="bottom-right" />
    </>
  )
}
