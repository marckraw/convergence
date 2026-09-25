import { Code2, Folder } from 'lucide-react'
import type { ProjectOpenApp } from '@/entities/project-open'
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'

interface ProjectOpenMenuSectionProps {
  apps: ProjectOpenApp[]
  loading: boolean
  disabledReason: string | null
  onOpen: (app: ProjectOpenApp) => void
}

/**
 * Open in…, as a section of a menu that holds more than it (the header's
 * Project group, MAR-3429 CH4 R4): one item per app, each named for where it
 * opens, or one disabled item saying why none can.
 *
 * The apps come from the menu's owner, which reads them once for as long as
 * it lives (`useProjectOpenApps`), never on each open: a list read on open
 * flashes "Detecting apps…" and moves the items below it while someone is
 * arrowing through them (lap 2 D).
 */
export function ProjectOpenMenuSection({
  apps,
  loading,
  disabledReason,
  onOpen,
}: ProjectOpenMenuSectionProps) {
  return (
    <div role="group" aria-label="Open in">
      <div className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">
        Open in
      </div>
      {disabledReason ? (
        <DropdownMenuItem disabled>{disabledReason}</DropdownMenuItem>
      ) : loading ? (
        <DropdownMenuItem disabled>Detecting apps...</DropdownMenuItem>
      ) : (
        apps.map((app) => {
          const Icon = app.kind === 'file-manager' ? Folder : Code2
          return (
            <DropdownMenuItem
              key={app.id}
              onSelect={() => onOpen(app)}
              className="gap-2"
            >
              <Icon className="h-3.5 w-3.5" />
              Open in {app.label}
            </DropdownMenuItem>
          )
        })
      )}
    </div>
  )
}
