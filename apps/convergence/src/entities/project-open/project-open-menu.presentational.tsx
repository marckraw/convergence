import type { FC } from 'react'
import { ChevronDown, Code2, Folder } from 'lucide-react'
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Tooltip,
} from '@convergence/ui'
import type { ProjectOpenApp } from './project-open.types'
import { openInLabel } from './project-open-list.pure'

interface ProjectOpenMenuProps {
  apps: readonly ProjectOpenApp[]
  /** What the list says in place of its apps (`projectOpenNote`), or null. */
  note: string | null
  onOpen: (app: ProjectOpenApp) => void
  /** The trigger's accessible name: "Open project", "Open in editor". */
  label: string
  /** The trigger's tooltip, when it says more than its name. */
  tooltip?: string
}

/**
 * The "Open ▾" menu: a path opened in an editor or in Finder (NAV-25,
 * DLG-29). The session header opens its project with it and a skill's
 * details open the skill's folder, from one part, so the two can't drift:
 * each app is "Open in <app>", and a list with nothing to offer says why in
 * itself, the trigger staying where it is.
 */
export const ProjectOpenMenu: FC<ProjectOpenMenuProps> = ({
  apps,
  note,
  onOpen,
  label,
  tooltip,
}) => (
  <Menu>
    <Tooltip label={tooltip ?? label}>
      <MenuTrigger
        render={
          <Button type="button" variant="ghost" aria-label={label} size="sm" />
        }
      >
        <Code2 className="size-3.5" />
        Open
        <ChevronDown className="size-3" />
      </MenuTrigger>
    </Tooltip>
    <MenuContent align="end" className="min-w-40">
      {note ? (
        <MenuItem disabled>{note}</MenuItem>
      ) : (
        apps.map((app) => {
          const Icon = app.kind === 'file-manager' ? Folder : Code2
          return (
            <MenuItem key={app.id} onClick={() => onOpen(app)}>
              <Icon className="size-3.5" />
              {openInLabel(app)}
            </MenuItem>
          )
        })
      )}
    </MenuContent>
  </Menu>
)
