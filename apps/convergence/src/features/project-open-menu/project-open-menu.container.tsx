import { useProjectOpenApps } from './use-project-open-apps'
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
  const { apps, loading, disabledReason, openIn } =
    useProjectOpenApps(targetPath)

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
