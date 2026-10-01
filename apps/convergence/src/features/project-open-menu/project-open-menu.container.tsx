import { useProjectOpenApps } from './use-project-open-apps'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from '@convergence/ui'
import { ChevronDown, Code2, Folder } from 'lucide-react'

interface ProjectOpenMenuContainerProps {
  targetPath: string | null
}

export function ProjectOpenMenuContainer({
  targetPath,
}: ProjectOpenMenuContainerProps) {
  const { apps, loading, disabledReason, openIn } =
    useProjectOpenApps(targetPath)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Tooltip label={disabledReason ?? 'Open project'}>
          <Button
            variant="ghost"
            disabled={!!disabledReason}
            aria-label="Open project"
            size="sm"
            className="gap-2"
          >
            <Code2 className="h-3.5 w-3.5" />
            Open
            <ChevronDown className="h-3 w-3" />
          </Button>
        </Tooltip>
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
                onClick={() => openIn(app)}
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
