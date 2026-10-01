import { useProjectOpenApps } from './use-project-open-apps'
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
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
    <Menu>
      <Tooltip label="Open project">
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              disabledReason={disabledReason ?? undefined}
              aria-label="Open project"
              size="sm"
              className="gap-2"
            />
          }
        >
          <Code2 className="h-3.5 w-3.5" />
          Open
          <ChevronDown className="h-3 w-3" />
        </MenuTrigger>
      </Tooltip>
      <MenuContent align="end" className="min-w-40">
        {loading ? (
          <MenuItem disabled>Detecting apps…</MenuItem>
        ) : (
          apps.map((app) => {
            const Icon = app.kind === 'file-manager' ? Folder : Code2
            return (
              <MenuItem key={app.id} onClick={() => openIn(app)}>
                <Icon className="h-3.5 w-3.5" />
                {app.label}
              </MenuItem>
            )
          })
        )}
      </MenuContent>
    </Menu>
  )
}
