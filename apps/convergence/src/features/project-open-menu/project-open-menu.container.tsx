import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { projectOpenApi, type ProjectOpenApp } from '@/entities/project-open'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { ChevronDown, Code2, Folder } from 'lucide-react'

interface ProjectOpenMenuContainerProps {
  targetPath: string | null
}

export function ProjectOpenMenuContainer({
  targetPath,
}: ProjectOpenMenuContainerProps) {
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

  const handleOpen = (app: ProjectOpenApp) => {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!!disabledReason}
          title={disabledReason ?? 'Open project'}
          aria-label="Open project"
        >
          <Code2 className="h-3.5 w-3.5" />
          Open
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {loading ? (
          <DropdownMenuItem disabled>Detecting apps...</DropdownMenuItem>
        ) : (
          apps.map((app) => {
            const Icon = app.kind === 'file-manager' ? Folder : Code2
            return (
              <DropdownMenuItem
                key={app.id}
                onClick={() => handleOpen(app)}
                className="gap-2"
              >
                <Icon className="h-3.5 w-3.5" />
                {app.label}
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
