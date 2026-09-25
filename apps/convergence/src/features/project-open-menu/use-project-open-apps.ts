import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { projectOpenApi, type ProjectOpenApp } from '@/entities/project-open'

/** The apps a path can open in, and the one way to open it in one. */
export function useProjectOpenApps(targetPath: string | null) {
  const [apps, setApps] = useState<ProjectOpenApp[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    void projectOpenApi
      .listApps()
      .then((nextApps) => {
        if (!cancelled) setApps(nextApps)
      })
      .catch(() => {
        if (!cancelled) setApps([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const disabledReason = useMemo(() => {
    if (!targetPath) return 'No project path available'
    if (!loading && apps.length === 0) return 'No supported apps found'
    return null
  }, [apps.length, loading, targetPath])

  const openIn = (app: ProjectOpenApp) => {
    if (!targetPath) return

    void projectOpenApi
      .open({ appId: app.id, path: targetPath })
      .then(() => {
        toast.success(
          app.kind === 'file-manager'
            ? 'Opened project in Finder'
            : `Opened project in ${app.label}`,
        )
      })
      .catch((err) => {
        toast.error(
          err instanceof Error ? err.message : 'Failed to open project',
        )
      })
  }

  return { apps, loading, disabledReason, openIn }
}
